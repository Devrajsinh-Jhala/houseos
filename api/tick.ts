import { Redis } from "@upstash/redis";
import webpush from "web-push";
// Type-only, so TypeScript erases it and nothing has to resolve at runtime.
// See the note at the top of subscribe.ts about why these files share no
// runtime module, and why this is a named export rather than a default one.
import type { StoredDevice } from "./subscribe";

// Runs every 15 minutes. On Vercel Pro that's a cron in vercel.json; on the free
// tier it's .github/workflows/tick.yml, because Hobby allows one run per day.
// Web push has no client-side scheduling on iOS, so the moment-of-event send
// happens here.

/** Duplicated from subscribe.ts — change one, change both. */
const DEVICES = "houseos:devices";

const WINDOW_MIN = 15;

/** A device that hasn't re-subscribed in this long has been uninstalled. */
const STALE_DAYS = 180;

export const config = { runtime: "nodejs" };

let client: Redis | null = null;

/** Lazy, so a deployment with no Upstash store answers readably instead of dying on import. */
function store(): Redis | null {
  if (client) return client;
  try {
    client = Redis.fromEnv();
    return client;
  } catch {
    return null;
  }
}

function minutesNowIn(timezone: string): { minutes: number; weekday: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    // Not hour12:false — that resolves to h24 in some ICU builds and reports
    // midnight as "24", putting the send window past every anchor of the day.
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: Math.max(0, days.indexOf(get("weekday"))),
  };
}

function dueNow(device: StoredDevice) {
  let minutes: number;
  let weekday: number;
  try {
    ({ minutes, weekday } = minutesNowIn(device.timezone));
  } catch {
    // A bad IANA name from a spoofed client would otherwise take down the
    // whole run and everyone else's reminders with it.
    ({ minutes, weekday } = minutesNowIn("UTC"));
  }
  const weekend = weekday === 0 || weekday === 6;

  return device.schedule.filter((s) => {
    if (s.dayScope === "weekday" && weekend) return false;
    if (s.dayScope === "weekend" && !weekend) return false;
    const [h, m] = s.time.split(":").map(Number);
    const at = h * 60 + m;
    return at >= minutes && at < minutes + WINDOW_MIN;
  });
}

export async function GET(): Promise<Response> {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // 503, not 500: running HouseOS with reminders off is a supported choice,
    // and the scheduler pinging this should not report it as a fault.
    return Response.json({ error: "No VAPID keys — reminders are off." }, { status: 503 });
  }

  const redis = store();
  if (!redis) {
    return Response.json(
      { error: "No Redis store configured — reminders are off for this deployment." },
      { status: 503 }
    );
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:you@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const devices = (await redis.hgetall<Record<string, StoredDevice>>(DEVICES)) ?? {};
  const staleBefore = Date.now() - STALE_DAYS * 86_400_000;

  let sent = 0;
  let dropped = 0;

  for (const [id, device] of Object.entries(devices)) {
    if (!device?.schedule) continue;

    if (Date.parse(device.updatedAt) < staleBefore) {
      await redis.hdel(DEVICES, id);
      dropped++;
      continue;
    }

    for (const s of dueNow(device)) {
      try {
        await webpush.sendNotification(
          device.subscription as webpush.PushSubscription,
          JSON.stringify({ title: s.name, body: s.time, tag: `routine-${s.time}`, url: "/" })
        );
        sent++;
      } catch (err) {
        // 404/410 mean the browser threw the subscription away. Keeping it
        // would make every future run slower for everyone else.
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await redis.hdel(DEVICES, id);
          dropped++;
          break;
        }
      }
    }
  }

  return Response.json({ sent, dropped, devices: Object.keys(devices).length });
}
