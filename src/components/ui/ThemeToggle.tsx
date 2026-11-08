"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Theme toggle — switches between light and dark mode.
 * Reads/writes localStorage, updates data-theme on <html>.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("pp-theme") as "light" | "dark" | null;
    const current = (saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) as "light" | "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("pp-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={`flex h-11 w-11 items-center justify-center rounded-md text-text transition-colors hover:bg-surface-hover ${className}`}
      >
        <span className="sr-only">Toggle theme</span>
        <span className="size-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-pressed={theme === "dark"}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-text transition-colors hover:bg-surface-hover ${className}`}
    >
      {theme === "light" ? (
        <Moon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Sun className="size-5" strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  );
}
