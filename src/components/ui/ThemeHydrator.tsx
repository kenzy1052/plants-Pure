"use client";

import { useEffect } from "react";

/**
 * Applies the saved theme to the document on client hydration.
 * Reads from localStorage (or falls back to system preference) and sets
 * data-theme="dark" on <html>. This prevents flash of wrong theme on load.
 */
export function ThemeHydrator() {
  useEffect(() => {
    const saved = localStorage.getItem("pp-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  }, []);
  return null;
}
