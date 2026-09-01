// Three states, not two. "System" has to stay reachable — a phone that flips to
// dark at sunset should take the app with it unless you've said otherwise.

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "houseos:theme";

/** Kept in sync with --paper in index.css, and with the boot script in index.html. */
const PAPER = { light: "#f4f5f1", dark: "#12160f" };

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    // Private mode and "block site data" both throw on read.
    return "system";
  }
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

/**
 * The status bar and the browser chrome read the theme-color meta, so it has to
 * move with an explicit choice. Two media-scoped tags can't express "the user
 * overrode the system", which is why there is one tag and we set it here.
 */
function paintChrome(resolved: "light" | "dark") {
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", PAPER[resolved]);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // No attribute at all is the signal for "follow the system".
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  paintChrome(resolve(theme));
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* the choice just won't survive a reload */
  }
}

/** Follow the OS while the setting is "system". Returns an unsubscribe. */
export function watchSystem(getTheme: () => Theme): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getTheme() === "system") paintChrome(prefersDark() ? "dark" : "light");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
