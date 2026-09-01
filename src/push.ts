// iOS notes that shaped this file:
//  - Push only works for web apps installed to the Home Screen. A Safari tab
//    cannot receive push even after permission is granted.
//  - The permission prompt must come from a direct tap, never on page load.
//  - There is no scheduled/local notification API, so timing lives on the
//    server (see api/tick.ts).

import { allItems } from "./db";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type PushSupport = "unsupported" | "unconfigured" | "ok";

export function pushSupport(): PushSupport {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  const iOSLike = /iP(hone|ad|od)/.test(navigator.userAgent);
  if (iOSLike && !isStandalone()) return "unsupported";
  // Nothing to offer if this deployment never got a VAPID key.
  if (!VAPID_PUBLIC) return "unconfigured";
  return "ok";
}

/**
 * Permission survives unsubscribing, so asking the Notification API alone
 * reports reminders as on long after they were switched off. The subscription
 * is the thing that actually decides.
 */
export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== "ok") return false;
  if (Notification.permission !== "granted") return false;
  return (await currentSubscription()) !== null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * The server can't read IndexedDB, so it needs its own copy of the routine
 * anchors to know when to fire.
 */
async function upload(sub: PushSubscription): Promise<void> {
  const schedule = (await allItems())
    .filter((i) => i.active && i.kind === "routine" && i.timeAnchor)
    .map((i) => ({ name: i.name, time: i.timeAnchor!, dayScope: i.dayScope }));

  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: sub,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      schedule,
    }),
  });
  if (!res.ok) throw new Error("Server rejected the subscription.");
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Must be called from inside a click handler. */
export async function enablePush(): Promise<void> {
  if (!VAPID_PUBLIC) {
    throw new Error("This deployment has no VAPID key set — see the readme.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission was declined.");

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    }));

  await upload(sub);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  // Tell the server first; if that fails we'd rather keep the local
  // subscription than leave a dead device on the cron's list.
  await fetch("/api/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

/**
 * Edited routines used to leave the server's copy stale until you remembered
 * to re-subscribe by hand. Now every routine save quietly re-uploads.
 * A no-op when reminders were never turned on.
 */
export async function refreshSchedule(): Promise<void> {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (!sub) return;
    await upload(sub);
  } catch {
    /* best effort — the next explicit subscribe will fix it */
  }
}
