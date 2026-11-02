import { useSyncExternalStore } from "react";

export type OfflineStatus = "preparing" | "ready" | "unavailable" | "development";
let status: OfflineStatus = import.meta.env.PROD ? "preparing" : "development";
const listeners = new Set<() => void>();
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function publish(next: OfflineStatus) {
  if (status === next) return;
  status = next;
  if (next === "ready") clearTimeout(timer);
  for (const listener of listeners) listener();
}

export function getOfflineStatus(): OfflineStatus { return status; }
export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getOfflineStatus);
}

function unavailable(error: unknown) {
  console.warn("HouseOS offline setup unavailable:", error);
  if (status !== "ready") publish("unavailable");
}

/** Confirm that the active worker really has its complete shell cached. */
function verify(worker: ServiceWorker) {
  const channel = new MessageChannel();
  const timeout = setTimeout(() => {
    channel.port1.close();
    console.warn("HouseOS offline worker did not confirm its cached resources.");
  }, 4000);
  channel.port1.onmessage = (event: MessageEvent) => {
    clearTimeout(timeout);
    channel.port1.close();
    if (event.data?.type === "HOUSEOS_OFFLINE_STATUS" && event.data.ready === true) publish("ready");
    else unavailable(new Error("The installed worker could not verify its cached resources."));
  };
  try { worker.postMessage({ type: "HOUSEOS_OFFLINE_STATUS" }, [channel.port2]); }
  catch (error) { clearTimeout(timeout); channel.port1.close(); unavailable(error); }
}

/** Begin immediately; external fonts must not delay offline installation. */
export function registerOffline(): void {
  if (import.meta.env.DEV) { publish("development"); return; }
  if (started && status !== "unavailable") return;
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    unavailable(new Error("Service workers are unavailable or this page is not a secure context."));
    return;
  }
  if (!started) navigator.serviceWorker.addEventListener("controllerchange", () => {
    const controller = navigator.serviceWorker.controller;
    if (controller) verify(controller);
  });
  started = true;
  publish("preparing");
  clearTimeout(timer);
  timer = setTimeout(() => unavailable(new Error("Offline installation has not finished. Keep the app online and retry.")), 15000);
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" }).then((registration) => {
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "activated") verify(worker);
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") verify(worker);
        else if (worker.state === "redundant" && !registration.active) unavailable(new Error("The offline shell download or installation failed."));
      });
    };
    watch(registration.active);
    watch(registration.installing);
    watch(registration.waiting);
    registration.addEventListener("updatefound", () => watch(registration.installing));
    // Reopening a cache-first shell must also check for a newer published build.
    // A failed online check leaves the already installed offline version usable.
    void registration.update().catch(() => {});
  }).catch(unavailable);
}
