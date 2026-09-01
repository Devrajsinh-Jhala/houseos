import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Production only. In dev the hand-written worker answers cache-first and
// starves Vite's HMR, so stale modules survive a reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
} else if (import.meta.env.DEV && "serviceWorker" in navigator) {
  // Unregister anything a previous build left behind on this origin.
  void navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => void r.unregister()))
    .catch(() => {});
}
