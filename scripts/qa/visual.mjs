#!/usr/bin/env node
/**
 * Visual + accessibility QA against a RUNNING app (see docs/DESIGN_SYSTEM.md, "QA").
 *   node scripts/qa/visual.mjs [baseUrl] [outDir]
 * For each page x viewport it: loads the page, fails on console errors, checks for
 * horizontal overflow, saves a full-page screenshot, and runs axe-core (WCAG 2.2 A/AA).
 * Then it checks keyboard behaviour of the cart drawer and the search sheet.
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "qa-output";
mkdirSync(out, { recursive: true });
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const VIEWPORTS = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];
const ALL_PAGES = [
  "/", "/shop", "/shop?category=herbal-infusions", "/shop?category=qa-empty-category", "/shop?category=no-such-category",
  "/shop?q=zzzz", "/shop?sort=price-desc&page=2", "/shop?page=99",
  "/product/qa-product-1", "/product/qa-product-2", "/product/qa-product-3", "/product/qa-product-4",
  "/product/qa-product-29", "/product/qa-product-30", "/product/does-not-exist",
  "/about", "/contact", "/does-not-exist",
  "/auth/sign-in", "/auth/sign-up", "/checkout", "/checkout/callback?reference=PP-1-aaaaaaaaaaaa", "/design-system",
];
// Pages that must answer 404 (draft and archived products look exactly like products that do not exist).
const EXPECT_404 = new Set(["/product/qa-product-29", "/product/qa-product-30", "/product/does-not-exist", "/does-not-exist"]);

// QA_PAGES="/a,/b" limits the run (the dev-only /design-system page is checked against `next dev`).
const PAGES = process.env.QA_PAGES ? process.env.QA_PAGES.split(",") : ALL_PAGES.filter((p) => p !== "/design-system");
const SKIP_KEYBOARD = Boolean(process.env.QA_PAGES);

let failures = 0;
const report = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/realtime|websocket|WebSocket|Failed to load resource/i.test(t)) return; // mock has no Realtime; 4xx from the mock auth endpoint
      errors.push(t);
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    const res = await page.goto(base + path, { waitUntil: "networkidle" });
    const label = `${vp.name.padStart(4)}  ${path}`;
    const want = EXPECT_404.has(path) ? 404 : 200;
    report(res?.status() === want, `${label}  status ${res?.status()} (expected ${want})`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report(overflow <= 0, `${label}  no horizontal overflow (${overflow}px)`);
    report(errors.length === 0, `${label}  no console errors ${errors.length ? JSON.stringify(errors.slice(0, 2)) : ""}`);
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(() => globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
    report(axe.violations.length === 0, `${label}  axe: ${axe.violations.length} violation(s) ${axe.violations.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`);
    for (const v of axe.violations) console.log("      ", v.id, v.help, v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
    // scroll through so scroll-reveal sections are shown before the full-page screenshot
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 900));
    });
    const file = `${out}/${vp.name}${path.replace(/[^\w]+/g, "_")}.png`;
    await page.screenshot({ path: file, fullPage: true });
    await page.close();
  }
  await ctx.close();
}

// ---- keyboard / dialog behaviour (desktop) ----
if (!SKIP_KEYBOARD) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + "/shop", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  report(await page.evaluate(() => document.activeElement?.classList.contains("skip-link")), "first Tab stop is the skip link");

  const cartBtn = page.getByRole("button", { name: /open cart/i });
  await cartBtn.focus();
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog", { name: /cart/i });
  report(await dlg.isVisible(), "Enter on the cart button opens the cart dialog");
  await page.keyboard.press("Escape");
  report(!(await dlg.isVisible()), "Escape closes the cart dialog");
  report(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Open cart")), "focus returns to the cart button after closing");

  await page.getByRole("button", { name: /search/i }).first().click();
  const search = page.getByRole("dialog", { name: /search/i });
  report(await search.isVisible(), "search button opens the search sheet");
  report(await page.evaluate(() => document.activeElement?.tagName === "INPUT"), "search input is focused when the sheet opens");
  await page.keyboard.type("qa");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/shop\?q=qa/);
  report(true, "search submits to /shop?q=");

  // add to cart updates the real count
  await page.goto(base + "/shop", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to cart: QA product 1" }).click();
  report(await page.getByRole("dialog", { name: /cart/i }).isVisible(), "adding to cart opens the cart drawer");
  await page.keyboard.press("Escape");
  report((await page.getByRole("button", { name: "Open cart, 1 item" }).count()) === 1, "cart button count reflects the add (1 item)");
  await ctx.close();
}

// ---- checkout with a filled cart (cart is saved in localStorage under "plants-pure-cart") ----
if (!SKIP_KEYBOARD) {
  for (const vp of [VIEWPORTS[1], VIEWPORTS[4]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(base + "/shop", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add to cart: QA product 1" }).click();
    await page.keyboard.press("Escape");
    await page.goto(base + "/checkout", { waitUntil: "networkidle" });
    report((await page.getByRole("heading", { name: "Checkout", level: 1 }).count()) === 1, `${vp.name}  checkout shows the saved cart`);
    report((await page.getByRole("button", { name: /^Pay/ }).isDisabled()), `${vp.name}  Pay is disabled until details are filled`);
    await page.getByLabel(/Full name/).fill("QA Tester");
    await page.getByLabel(/Phone number/).fill("0241234567");
    await page.getByLabel(/Email address/).fill("qa@example.com");
    await page.getByLabel(/Address or landmark/).fill("QA street");
    report(await page.getByRole("button", { name: /^Pay/ }).isEnabled(), `${vp.name}  Pay is enabled once details are filled`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report(overflow <= 0, `${vp.name}  checkout (filled cart) no horizontal overflow`);
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(() => globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
    report(axe.violations.length === 0, `${vp.name}  checkout (filled cart) axe: ${axe.violations.map((v) => v.id).join(", ") || "0 violations"}`);
    await page.screenshot({ path: `${out}/${vp.name}_checkout_filled.png`, fullPage: true });
    await ctx.close();
  }
}

// ---- contrast of every button label against its own background (guards against invisible labels) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const path of ["/", "/shop", "/auth/sign-in", "/product/qa-product-1"]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    const bad = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const out = [];
      for (const el of document.querySelectorAll("a, button")) {
        if (!el.textContent?.trim() || el.offsetParent === null) continue;
        let bgEl = el, bg = "rgba(0, 0, 0, 0)";
        while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test((bg = getComputedStyle(bgEl).backgroundColor))) bgEl = bgEl.parentElement;
        if (!bgEl) continue;
        const l1 = lum(getComputedStyle(el).color), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio < 4.5) out.push(`${el.textContent.trim().slice(0, 30)} (${ratio.toFixed(2)})`);
      }
      return out;
    });
    report(bad.length === 0, `${path}  every link/button label has >= 4.5:1 contrast ${bad.length ? JSON.stringify(bad) : ""}`);
  }
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} QA check(s) failed` : "\nAll QA checks passed");
process.exit(failures ? 1 : 0);
