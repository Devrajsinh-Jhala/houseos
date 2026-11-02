import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerOffline } from "./offline";
import "./index.css";
import "./shell.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Production only. The build preloads the complete version before installing
// its worker. The base URL also supports deployment below a subdirectory.
registerOffline();
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  // Unregister anything a previous build left behind on this origin.
  void navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => void r.unregister()))
    .catch(() => {});
}
