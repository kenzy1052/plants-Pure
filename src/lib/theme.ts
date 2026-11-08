export type Theme = "light" | "dark";
export const THEME_KEY = "pp-theme";

/** Inline script run before paint so the saved theme applies with no flash. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark');if(sessionStorage.getItem('pp-intro-seen')==='1')document.documentElement.setAttribute('data-intro-seen','')}catch(e){}})();`;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
