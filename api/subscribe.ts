import { DEVICES, deviceId, notConfigured, store, type StoredDevice } from "./_store";

export type { StoredDevice };

export const config = { runtime: "nodejs" };

/** A phone with a hundred routine anchors is a bug, not a household. */
const MAX_ANCHORS = 100;

export default async function handler(req: Request): Promise<Response> {
  let redis;
  try {
    redis = store();
  } catch {
    return notConfigured();
  }

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
