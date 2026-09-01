import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

// Underscore-prefixed, so Vercel does not route this as a function.

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

let client: Redis | null = null;

/**
 * Lazy on purpose. `Redis.fromEnv()` throws when the Upstash variables are
 * missing, and at module scope that throw happens on import — so a deployment
 * without a Redis store returns an opaque crash instead of a readable error.
 * Push is optional in this app; failing to configure it should not look like a
 * broken deploy.
 */
export function store(): Redis {
  if (!client) client = Redis.fromEnv();
  return client;
}

export function notConfigured(): Response {
  return Response.json(
    { error: "No Redis store configured — reminders are off for this deployment." },
    { status: 503 }
  );
}
