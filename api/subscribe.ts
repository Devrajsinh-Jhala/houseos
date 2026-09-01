import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// One field per device, keyed by a hash of its push endpoint. The first cut of
// this used a single key for one device, which meant the second person to
// install the app silently evicted the first.
export const DEVICES = "houseos:devices";

export interface StoredDevice {
  subscription: { endpoint: string; keys?: Record<string, string> };
  timezone: string;
  /** Routine anchors mirrored from the phone, so the cron knows when to fire. */
  schedule: { name: string; time: string; dayScope: "any" | "weekday" | "weekend" }[];
  updatedAt: string;
}

export function deviceId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
}

export const config = { runtime: "nodejs" };

/** A phone with a hundred routine anchors is a bug, not a household. */
const MAX_ANCHORS = 100;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "DELETE") {
    const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
    if (!endpoint) return new Response("Missing endpoint", { status: 400 });
    await redis.hdel(DEVICES, deviceId(endpoint));
    return Response.json({ ok: true });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

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
