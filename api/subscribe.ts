import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

// Named method exports, not `export default`. Vercel's Node runtime reads a
// default export as the `(req, res) => void` signature and *ignores* whatever
// it returns — so a handler that returns a Response never writes anything and
// the request hangs until it times out. GET/POST/DELETE exports get the
// Web-standard Request -> Response signature this file is written against.
//
// Self-contained on purpose too: each file under api/ is built as its own
// function, an underscore-prefixed helper is excluded from the build outright,
// and a plain relative import needs a file extension once it runs as ESM.
// tick.ts borrows only the StoredDevice *type*, which TypeScript erases.
//
// The upshot: DEVICES below is duplicated in tick.ts. Change one, change both.

export const DEVICES = "houseos:devices";

export interface StoredDevice {
  subscription: { endpoint: string; keys?: Record<string, string> };
  timezone: string;
  /** Routine anchors mirrored from the phone, so the cron knows when to fire. */
  schedule: { name: string; time: string; dayScope: "any" | "weekday" | "weekend" }[];
  updatedAt: string;
}

function deviceId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
}

let client: Redis | null = null;

/**
 * Lazy. `Redis.fromEnv()` throws when the Upstash variables are missing, and at
 * module scope that throw happens on import — so a deployment without a Redis
 * store returns an opaque crash instead of a readable error. Push is optional
 * in this app; skipping it should not look like a broken deploy.
 */
function store(): Redis | null {
  if (client) return client;
  // Checked explicitly rather than relying on fromEnv() to throw: it does not
  // always, and a half-built client fails later on the first command with a
  // 500 instead of the clean "not configured" answer this is here to give.
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    client = Redis.fromEnv();
    return client;
  } catch {
    return null;
  }
}

function notConfigured(): Response {
  return Response.json(
    { error: "No Redis store configured — reminders are off for this deployment." },
    { status: 503 }
  );
}

export const config = { runtime: "nodejs" };

/** A phone with a hundred routine anchors is a bug, not a household. */
const MAX_ANCHORS = 100;

export async function POST(req: Request): Promise<Response> {
  const redis = store();
  if (!redis) return notConfigured();

  const body = (await req.json().catch(() => ({}))) as Partial<StoredDevice>;
  const endpoint = body.subscription?.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return new Response("Missing subscription", { status: 400 });
  }

  const schedule = (body.schedule ?? [])
    .filter((s) => s && typeof s.name === "string" && /^\d{2}:\d{2}$/.test(s.time))
    .slice(0, MAX_ANCHORS);

  const device: StoredDevice = {
    subscription: body.subscription!,
    timezone: body.timezone || "Asia/Kolkata",
    schedule,
    updatedAt: new Date().toISOString(),
  };

  await redis.hset(DEVICES, { [deviceId(endpoint)]: device });
  return Response.json({ ok: true, anchors: device.schedule.length });
}

export async function DELETE(req: Request): Promise<Response> {
  const redis = store();
  if (!redis) return notConfigured();

  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return new Response("Missing endpoint", { status: 400 });
  await redis.hdel(DEVICES, deviceId(endpoint));
  return Response.json({ ok: true });
}
