export type Theme = "dark" | "light";

const STORAGE_KEY = "rs-theme";

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("theme-light", theme === "light");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  // The sonner Toaster can't read the html class — let listeners re-render.
  try {
    window.dispatchEvent(new CustomEvent("rs-theme-changed", { detail: theme }));
  } catch {}
}

/** Injected inline in the root layout before hydration — no flash. */
export const THEME_BOOTSTRAP_SCRIPT = `try{if(localStorage.getItem("${STORAGE_KEY}")==="light")document.documentElement.classList.add("theme-light")}catch(e){}`;
