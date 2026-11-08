import { create } from "zustand";

/**
 * A page can ask the site header to show its own title (e.g. the product name once the big
 * heading has scrolled out of view). The header cross-fades the logo/menu into this title.
 */
interface PageTitleState {
  title: string | null;
  subtitle: string | null;
  set: (v: { title: string; subtitle?: string | null } | null) => void;
}

export const usePageTitle = create<PageTitleState>((set) => ({
  title: null,
  subtitle: null,
  set: (v) => set(v ? { title: v.title, subtitle: v.subtitle ?? null } : { title: null, subtitle: null }),
}));
