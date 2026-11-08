import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, MapPin } from "lucide-react";
import cinnamon from "@/assets/hero-products/cinnamon-powder.png";
import curry from "@/assets/hero-products/curry-powder.png";
import allSpice from "@/assets/hero-products/all-spice-blend.png";
import "./immersive-hero.css";

/**
 * Scroll-driven hero: opening "PLANTS & PURE" composition -> final hero on a low black display stand.
 *
 * The final composition is laid out in the coordinate space of the approved reference image
 * (1376 x 768). `u` is the px size of one reference unit, so the bottles and the stand scale together.
 * Reference point (998, 548) is the base of the centre (Curry) bottle.
 */
const REF_X = 998;
const REF_Y = 548;

type Frame = { x: number; base: number; h: number };

type Product = {
  src: string;
  name: string;
  dimensions: { width: number; height: number };
  /** transparent margin of the cut-out, as a fraction of its height */
  pad: number;
  /** index into DISCS */
  disc: number;
  /** opening composition, as fractions of the stage (measured from the approved opening frame) */
  start: Frame;
  startMobile: Frame;
  /** final position in reference units: x = bottle centre, base = bottom edge, h = visible height */
  ref: Frame;
  /** peak 3D motion in the middle of the transition */
  motion: { ry: number; rx: number; rz: number; z: number };
};

const PRODUCTS: Product[] = [
  {
    src: cinnamon,
    name: "Cinnamon Powder",
    dimensions: { width: 355, height: 940 },
    pad: 6 / 940,
    disc: 0,
    start: { x: 0.342, base: 0.857, h: 0.41 },
    startMobile: { x: 0.25, base: 0.78, h: 0.26 },
    ref: { x: 805, base: 542, h: 324 },
    motion: { ry: -13, rx: -2.5, rz: -1.4, z: -70 },
  },
  {
    src: curry,
    name: "Curry Powder",
    dimensions: { width: 252, height: 630 },
    pad: 6 / 630,
    disc: 1,
    start: { x: 0.475, base: 0.854, h: 0.459 },
    startMobile: { x: 0.5, base: 0.78, h: 0.29 },
    ref: { x: 998, base: 548, h: 440 },
    motion: { ry: 8, rx: -2, rz: 0, z: 90 },
  },
  {
    src: allSpice,
    name: "All Spice Blend",
    dimensions: { width: 381, height: 1047 },
    pad: 6 / 1047,
    disc: 2,
    start: { x: 0.628, base: 0.858, h: 0.419 },
    startMobile: { x: 0.75, base: 0.78, h: 0.26 },
    ref: { x: 1197, base: 542, h: 334 },
    motion: { ry: 13, rx: -2.5, rz: 1.4, z: -70 },
  },
];

/** The three low cylinders (reference units) and when each one rises into place. */
const DISCS = [
  { cx: 805, ry: 14, top: 544, side: 84, rise: [0.3, 0.76] },
  { cx: 998, ry: 17, top: 550, side: 105, rise: [0.34, 0.82] },
  { cx: 1197, ry: 14, top: 544, side: 84, rise: [0.32, 0.78] },
] as const;

/** Final copy is revealed line by line while the products settle: kicker, headline, body, buttons. */
const REVEAL = [
  [0.62, 0.78],
  [0.66, 0.84],
  [0.72, 0.88],
  [0.76, 0.91],
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const smootherstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (from: number, to: number, t: number) => from + (to - from) * t;

type Layout = { W: number; H: number; mobile: boolean; u: number; ax: number; ay: number; offsets: number[] };

/** A scroll-controlled product film made from the company's supplied product photos. */
export function ImmersiveHero() {
  const trackRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQuery = window.matchMedia("(max-width: 700px)");
    const nodes = Array.from(track.querySelectorAll<HTMLElement>("[data-product-index]"));
    const finalCopy = track.querySelector<HTMLElement>(".pp-hero-final-copy");
    const openingFoot = track.querySelector<HTMLElement>(".pp-hero-opening-foot");
    const pin = track.firstElementChild as HTMLElement;
    let raf = 0;
    let layout: Layout | null = null;

    /** Resolve stage geometry once per resize, not per scroll frame. */
    const measure = () => {
      const W = pin.clientWidth;
      const H = pin.clientHeight;
      const mobile = mobileQuery.matches;
      const u = mobile ? Math.min((0.3 * H) / 440, W / 700) : Math.min(H / 768, W / 1376);
      const ax = mobile ? W * 0.5 : W * 0.725;
      const ay = mobile ? H * 0.8 : H * 0.5 + (REF_Y - 384) * u;
      // how far below the stage each disc starts, so it enters from the bottom edge
      const offsets = DISCS.map((d) => H - (ay + (d.top - d.ry - REF_Y) * u) + 8);
      layout = { W, H, mobile, u, ax, ay, offsets };

      track.style.setProperty("--pp-u", `${u.toFixed(4)}px`);
      track.style.setProperty("--pp-ax", `${ax.toFixed(2)}px`);
      track.style.setProperty("--pp-ay", `${ay.toFixed(2)}px`);
      nodes.forEach((node) => {
        const product = PRODUCTS[Number(node.dataset.productIndex)];
        if (!product) return;
        const h = (product.ref.h * u) / (1 - 2 * product.pad);
        const w = (h * product.dimensions.width) / product.dimensions.height;
        node.style.setProperty("--pp-h", `${h.toFixed(2)}px`);
        node.style.setProperty("--pp-w", `${w.toFixed(2)}px`);
      });
    };

    const render = () => {
      raf = 0;
      if (!layout) measure();
      if (!layout) return;
      const { W, H, mobile, u, ax, ay, offsets } = layout;

      const rect = track.getBoundingClientRect();
      const pinHeight = pin.getBoundingClientRect().height || window.innerHeight;
      const maxProgress = Math.max(1, track.offsetHeight - pinHeight);
      const progress = reduceMotion.matches ? 1 : clamp(-rect.top / maxProgress);
      const isOverHero = rect.top <= window.innerHeight && rect.bottom > 0;
      document.body.classList.toggle("pp-hero-header-dark", isOverHero);
      track.dataset.reduced = String(reduceMotion.matches);

      // Opening copy leaves first
      const set = (name: string, value: string) => track.style.setProperty(name, value);
      const kickerOut = smoothstep(0.08, 0.24, progress);
      const titleOut = smoothstep(0.1, 0.32, progress);
      const footOut = smoothstep(0.1, 0.3, progress);
      set("--pp-progress", progress.toFixed(4));
      set("--pp-kicker-opacity", (1 - kickerOut).toFixed(3));
      set("--pp-kicker-shift", `${(-12 * kickerOut).toFixed(2)}px`);
      set("--pp-intro-title-opacity", (1 - titleOut).toFixed(3));
      set("--pp-intro-title-shift", `${(-28 * titleOut).toFixed(2)}px`);
      set("--pp-intro-foot-opacity", (1 - footOut).toFixed(3));
      set("--pp-intro-foot-shift", `${(16 * footOut).toFixed(2)}px`);

      // Final copy is revealed as the products settle
      REVEAL.forEach(([from, to], i) => set(`--pp-r${i}`, smoothstep(from, to, progress).toFixed(3)));

      // Stand rises from below the stage edge
      const rises = DISCS.map((d) => smootherstep(d.rise[0], d.rise[1], progress));
      const discNames = ["left", "center", "right"];
      rises.forEach((e, i) => set(`--pp-d-${discNames[i]}`, `${(offsets[i] * (1 - e)).toFixed(2)}px`));
      set("--pp-stand-reflect", smoothstep(0.55, 0.86, progress).toFixed(3));
      set("--pp-bottle-reflect", (0.22 * (1 - smoothstep(0.1, 0.4, progress))).toFixed(3));
      set("--pp-contact", smoothstep(0.7, 0.86, progress).toFixed(3));

      const copyVisible = reduceMotion.matches || progress >= REVEAL[0][0];
      finalCopy?.setAttribute("aria-hidden", String(!copyVisible));
      finalCopy?.toggleAttribute("inert", !copyVisible);
      openingFoot?.toggleAttribute("inert", reduceMotion.matches || progress >= 0.3);

      // Products: travel + scale + 3D turn (move), then lower onto the stand (settle)
      const move = smootherstep(0.14, 0.62, progress);
      const settle = smootherstep(0.36, 0.84, progress);
      const arc = Math.sin(Math.PI * move);

      nodes.forEach((node) => {
        const product = PRODUCTS[Number(node.dataset.productIndex)];
        if (!product) return;
        const { pad, motion, ref } = product;
        const from = mobile ? product.startMobile : product.start;

        const finH = (ref.h * u) / (1 - 2 * pad);
        const finX = ax + (ref.x - REF_X) * u;
        const finBase = ay + (ref.base - REF_Y) * u;
        const finW = (finH * product.dimensions.width) / product.dimensions.height;

        const startH = (from.h * H) / (1 - 2 * pad);
        const scale = mix(startH / finH, 1, move);
        const cx = mix(from.x * W, finX, move);

        // visible base: rises with a small overshoot, then is lowered onto the disc surface
        let base = mix(from.base * H, finBase, settle) - H * 0.018 * Math.sin(Math.PI * settle);
        // never let a bottle sink into its disc while the disc is still rising
        base = Math.min(base, finBase + offsets[product.disc] * (1 - rises[product.disc]));

        const imgBottom = base + pad * finH * scale;
        node.style.setProperty("--pp-x", `${(cx - finW / 2).toFixed(2)}px`);
        node.style.setProperty("--pp-y", `${(imgBottom - finH).toFixed(2)}px`);
        node.style.setProperty("--pp-s", scale.toFixed(4));
        node.style.setProperty("--pp-z", `${(motion.z * arc).toFixed(2)}px`);
        node.style.setProperty("--pp-ry", `${(motion.ry * arc).toFixed(2)}deg`);
        node.style.setProperty("--pp-rx", `${(motion.rx * arc).toFixed(2)}deg`);
        node.style.setProperty("--pp-rz", `${(motion.rz * arc).toFixed(2)}deg`);
      });
    };

    const requestRender = () => {
      if (!raf) raf = window.requestAnimationFrame(render);
    };
    const onResize = () => {
      measure();
      requestRender();
    };
    measure();
    render();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    reduceMotion.addEventListener("change", requestRender);

    return () => {
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", onResize);
      reduceMotion.removeEventListener("change", requestRender);
      if (raf) window.cancelAnimationFrame(raf);
      document.body.classList.remove("pp-hero-header-dark");
    };
  }, []);

  const explore = () => {
    window.scrollBy({
      top: window.innerHeight * 0.78,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <section
      ref={trackRef}
      className="pp-hero-track"
      aria-label="Plants & Pure product introduction"
    >
      <div className="pp-hero-pin">
        <p className="pp-hero-kicker">HEALTHY LIVING ON THE GO.</p>
        <div className="pp-hero-opening-title" aria-hidden="true">
          <span>
            PLANTS <em>&amp;</em> PURE
          </span>
        </div>

        <div className="pp-hero-stand" aria-hidden="true">
          {DISCS.map((disc, index) => (
            <div
              key={disc.cx}
              className={`pp-disc pp-disc-${["left", "center", "right"][index]}`}
              style={
                {
                  "--cx": disc.cx,
                  "--ry": disc.ry,
                  "--top": disc.top,
                  "--side": disc.side,
                } as CSSProperties
              }
            >
              <div className="pp-disc-reflect" />
              <div className="pp-disc-body" />
              <div className="pp-disc-top" />
            </div>
          ))}
        </div>

        <div
          className="pp-hero-products"
          role="group"
          aria-label="Featured products from Plants & Pure"
        >
          {PRODUCTS.map((product, index) => {
            const aspect = product.dimensions.width / product.dimensions.height;
            return (
              <figure
                className={`pp-hero-product pp-hero-product-${index + 1}`}
                key={product.name}
                data-product-index={index}
                style={
                  {
                    // first-paint fallback; the scroll script takes over on mount
                    "--pp-h": `calc(100svh * ${product.start.h})`,
                    "--pp-w": `calc(100svh * ${(product.start.h * aspect).toFixed(4)})`,
                    "--pp-x": `calc(100vw * ${product.start.x} - 100svh * ${(product.start.h * aspect * 0.5).toFixed(4)})`,
                    "--pp-y": `calc(100svh * ${product.start.base - product.start.h})`,
                  } as CSSProperties
                }
              >
                <span className="pp-hero-contact" aria-hidden="true" />
                <img
                  className="pp-hero-reflect"
                  src={product.src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <img
                  className="pp-hero-photo"
                  src={product.src}
                  alt={product.name}
                  width={product.dimensions.width}
                  height={product.dimensions.height}
                  fetchPriority={index === 1 ? "high" : "auto"}
                  decoding="async"
                  draggable={false}
                />
                <figcaption>{product.name}</figcaption>
              </figure>
            );
          })}
        </div>

        <div className="pp-hero-opening-foot">
          <p>Nature’s goodness, carefully prepared for your kitchen.</p>
          <button type="button" onClick={explore} className="pp-hero-scroll-cue">
            <span>SCROLL TO EXPLORE</span>
            <ChevronDown aria-hidden="true" size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="pp-hero-final-copy" aria-hidden="true" inert>
          <p className="pp-hero-final-kicker">MADE WITH CARE IN ACCRA</p>
          <h1>
            Quality spices,
            <br />
            herbs and oils.
          </h1>
          <p className="pp-hero-final-description">
            Wholesome, natural spices, herbs and oils from Accra, prepared with strict attention to
            quality, authenticity and trust.
          </p>
          <div className="pp-hero-actions">
            <Link to="/shop" className="pp-hero-button pp-hero-button-primary">
              Shop the collection <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link to="/contact" className="pp-hero-button pp-hero-button-secondary">
              <MapPin aria-hidden="true" size={16} /> Find us in store
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
