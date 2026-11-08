import { useEffect, useState } from "react";
import { PHOTO } from "@/assets/company";

const KEY = "pp-intro-seen";

/**
 * Brand onboarding (~3s, once per session). It is part of the server HTML so it covers the page
 * from the first paint. A tiny head script hides it instantly when it was already seen this
 * session. The hero entrance is released (data-hero-go) as the overlay begins to leave, so the
 * page rises up under the fading logo. Reduced motion: plain fade.
 */
export function Intro() {
  const [phase, setPhase] = useState<"play" | "exit" | "done">("play");

  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute("data-intro-seen")) {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable */
    }
    root.style.overflow = "hidden";
    const t1 = setTimeout(() => {
      setPhase("exit");
      root.setAttribute("data-hero-go", "");
    }, 2300);
    const t2 = setTimeout(() => {
      setPhase("done");
      root.setAttribute("data-intro-seen", "");
    }, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      root.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (phase !== "play") document.documentElement.style.overflow = "";
  }, [phase]);

  if (phase === "done") return null;

  const skip = () => {
    document.documentElement.setAttribute("data-hero-go", "");
    setPhase("exit");
    setTimeout(() => {
      setPhase("done");
      document.documentElement.setAttribute("data-intro-seen", "");
    }, 600);
  };

  return (
    <div
      className="pp-intro stage fixed inset-0 z-[9000] flex items-center justify-center overflow-hidden bg-night text-night-foreground transition-[opacity,transform] duration-[700ms] ease-[var(--ease-swift)]"
      style={{ opacity: phase === "exit" ? 0 : 1, transform: phase === "exit" ? "scale(1.03)" : "none" }}
      aria-hidden
    >
      <div className="relative flex flex-col items-center gap-8 text-center">
        <img src={PHOTO.logo} alt="" width={629} height={416} className="pp-intro-logo w-[min(70vw,24rem)] drop-shadow-[0_30px_60px_rgb(227_27_27/0.45)]" />
        <p className="pp-intro-fade font-display text-[clamp(1.4rem,3vw,2rem)] italic text-night-foreground/90" style={{ animationDelay: "0.9s" }}>
          Healthy living on the go
        </p>
        <div className="pp-intro-line h-[2px] w-44 origin-left rounded-full bg-lime-gradient" />
      </div>
      <button type="button" onClick={skip} className="type-label absolute bottom-6 right-6 rounded-full border border-night-foreground/25 px-4 py-2 text-night-foreground/80 hover:bg-night-foreground/10">
        Skip intro
      </button>
      <style>{`
        .pp-intro-logo { animation: pp-logo 1.4s 0.1s var(--ease-settle) both }
        .pp-intro-fade { animation: pp-fade 0.9s ease both }
        .pp-intro-line { animation: pp-line 1.6s 0.5s var(--ease-settle) both }
        @keyframes pp-logo { from { opacity: 0; transform: scale(.82) translateY(20px); filter: blur(10px) } to { opacity: 1; transform: none; filter: none } }
        @keyframes pp-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pp-line { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @media (prefers-reduced-motion: reduce) {
          .pp-intro-logo, .pp-intro-line { animation: pp-fade 0.6s ease both !important; animation-iteration-count: 1 !important; }
        }
      `}</style>
    </div>
  );
}
