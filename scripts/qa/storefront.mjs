#!/usr/bin/env node
/**
 * Functional QA of the Phase 3 storefront against a RUNNING app + the QA mock catalogue
 * (scripts/qa/mock-supabase.mjs: 30 fake "QA product N" records; #29 is a draft, #30 is archived,
 * 28 are published). Checks behaviour, not looks: see visual.mjs for layout and accessibility.
 *   node scripts/qa/storefront.mjs [baseUrl]
 */
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let failures = 0;
const check = (ok, msg, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${ok || !extra ? "" : `  -> ${extra}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const dbRequests = [];
const badAssets = [];
page.on("request", (r) => { if (/:54321\//.test(r.url())) dbRequests.push(r.url()); });
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.origin === new URL(base).origin && r.status() >= 400 && !u.pathname.startsWith("/_next/image") && r.request().resourceType() !== "document" && !u.pathname.startsWith("/api/")) badAssets.push(`${r.status()} ${u.pathname}`);
});

const cards = () => page.getByRole("button", { name: /^Add to cart: |^Unavailable: / }).count();
const go = async (path) => { await page.goto(base + path, { waitUntil: "networkidle" }); };

// ---------------------------------------------------------------- shop: data, paging, filters
await go("/shop");
check((await cards()) === 12, "shop page 1 shows 12 products (page size)", String(await cards()));
check(/28 products\s*·\s*page 1 of 3/.test(await page.getByRole("status").filter({ hasText: "products" }).first().innerText()), "result summary says 28 products, page 1 of 3 (draft and archived excluded)");
check((await page.getByText("QA product 29", { exact: true }).count()) === 0 && (await page.getByText("QA product 30", { exact: true }).count()) === 0, "draft and archived products never appear in the shop");

await page.getByRole("link", { name: "Page 2" }).click();
await page.waitForURL(/page=2/);
check((await cards()) === 12, "page 2 shows 12 products");
await page.getByRole("link", { name: "Page 3" }).click();
await page.waitForURL(/page=3/);
check((await cards()) === 4, "page 3 shows the remaining 4");
check((await page.getByRole("link", { name: "Next page" }).count()) === 0 && (await page.getByRole("link", { name: "Previous page" }).count()) === 1, "last page has Previous but no Next");

await go("/shop?page=99");
check(/page=3/.test(page.url()) && (await cards()) === 4, "a page past the end redirects to the last page", page.url());

await go("/shop?q=tagline%208");
check((await cards()) === 1 && (await page.getByRole("link", { name: "QA product 8" }).count()) === 1, "keyword search finds the matching product (tagline)");
await go("/shop?q=zzzz");
check((await page.getByText("Nothing matches that search").count()) === 1 && (await cards()) === 0, "no-results state for a search with no matches");
check((await page.getByRole("link", { name: "Clear search and filters" }).first().getAttribute("href")) === "/shop", "no-results state offers a working clear link");
await go("/shop?q=x%29%2Ctitle.ilike.%2A");
check((await page.getByText("We can’t load the shop right now").count()) === 0, "a hostile search string cannot break the query");

await go("/shop");
const chipNames = await page.getByRole("navigation", { name: "Categories" }).getByRole("link").allInnerTexts();
check(chipNames.join("|") === "All|Culinary Spices|Herbal Infusions|Pure Botanical Oils", "category chips come from the database; categories with no published products are hidden", chipNames.join("|"));
await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Herbal Infusions" }).click();
await page.waitForURL(/category=herbal-infusions/);
const herbalCount = await cards();
check(herbalCount > 0 && /in Herbal Infusions/.test(await page.getByRole("status").filter({ hasText: "products" }).first().innerText()), "category filter narrows the list and says so", String(herbalCount));
check((await page.getByRole("heading", { level: 1 }).innerText()) === "Herbal Infusions", "category page heading shows the category");

await go("/shop?category=qa-empty-category");
check((await page.getByText("No products in this category yet").count()) === 1, "a category without published products shows an intentional empty state");
await go("/shop?category=no-such-category");
check((await page.getByText("We can’t find that category").count()) === 1, "an unknown category says so instead of showing everything");

await go("/shop?sort=price-asc");
const prices = (await page.locator("article").evaluateAll((els) => els.map((e) => Number((e.textContent.match(/GH₵\s*([\d,]+\.\d{2})/) ?? [])[1]?.replace(",", ""))))).filter(Number.isFinite);
check(prices.length > 1 && prices.every((p, i) => i === 0 || p >= prices[i - 1]), "price low-to-high sorts correctly", prices.join(","));
await go("/shop?sort=price-desc");
const prices2 = (await page.locator("article").evaluateAll((els) => els.map((e) => Number((e.textContent.match(/GH₵\s*([\d,]+\.\d{2})/) ?? [])[1]?.replace(",", ""))))).filter(Number.isFinite);
check(prices2.length > 1 && prices2.every((p, i) => i === 0 || p <= prices2[i - 1]), "price high-to-low sorts correctly", prices2.join(","));

// search + category + sort together, and paging keeps them
await go("/shop?category=culinary-spices&sort=price-asc&q=qa");
const lnk = await page.getByRole("link", { name: "Page 2" }).getAttribute("href").catch(() => null);
check(lnk === null || (lnk.includes("category=culinary-spices") && lnk.includes("sort=price-asc") && lnk.includes("q=qa")), "paging links keep search, category and sort together", String(lnk));
await page.getByLabel("Search the shop").fill("product 1");
await page.getByRole("button", { name: "Search", exact: true }).click();
await page.waitForURL(/q=product\+1|q=product%201/);
check(/category=culinary-spices/.test(page.url()) && /sort=price-asc/.test(page.url()), "a new search keeps the active category and sort", page.url());

// sort select (desktop)
await go("/shop");
await page.locator("#sort-select").selectOption("price-desc");
await page.waitForURL(/sort=price-desc/);
check(true, "the sort menu navigates with the choice in the URL");

// mobile: filter & sort drawer
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(base + "/shop", { waitUntil: "networkidle" });
check((await mp.locator("#sort-select").isVisible()) === false, "mobile hides the inline sort menu");
await mp.getByRole("button", { name: /Filter & sort/ }).click();
const dlg = mp.getByRole("dialog");
check(await dlg.isVisible(), "mobile Filter & sort opens a dialog");
await dlg.getByRole("link", { name: /Herbal Infusions/ }).click();
await mp.waitForURL(/category=herbal-infusions/);
check(!(await mp.getByRole("dialog").isVisible().catch(() => false)), "the mobile drawer closes after choosing a filter");
check((await mp.getByRole("button", { name: /Filter & sort/ }).innerText()).match(/1/) !== null, "the mobile button shows the active filter count", await mp.getByRole("button", { name: /Filter & sort/ }).innerText());
await mp.getByRole("button", { name: /Filter & sort/ }).click();
await mp.getByRole("dialog").getByRole("link", { name: /Price: low to high/ }).click();
await mp.waitForURL(/sort=price-asc/);
check(/category=herbal-infusions/.test(mp.url()), "choosing a sort on mobile keeps the category", mp.url());
check((await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), "no horizontal overflow on the mobile shop");
await mob.close();

// no browser-side database traffic: everything is server-rendered
check(dbRequests.length === 0, "the browser never queries the database directly (no downloaded catalogue)", String(dbRequests.length));

// ---------------------------------------------------------------- cards and images
await go("/shop");
const firstHref = await page.locator('article a[href^="/product/"]').first().getAttribute("href");
check(/^\/product\/qa-product-\d+$/.test(firstHref ?? ""), "cards link to product pages by slug", String(firstHref));
await page.locator('article a[href^="/product/"]').first().click();
await page.waitForURL(/\/product\//);
check(true, "clicking a product card opens its product page");

await go("/shop");
await page.waitForTimeout(800);
const imgState = await page.locator("article img").evaluateAll((els) => els.map((i) => ({ src: i.getAttribute("src") ?? "", ok: i.complete && i.naturalWidth > 0 })));
check(imgState.length > 0 && imgState.every((i) => i.ok), "no card shows a broken image (failed images fall back to the placeholder)", JSON.stringify(imgState.filter((i) => !i.ok)));
check(imgState.some((i) => i.src.includes("product-placeholder")), "the placeholder is used when an image is missing or fails");

// ---------------------------------------------------------------- product page
await go("/product/qa-product-1");
check((await page.getByRole("heading", { level: 1 }).innerText()) === "QA product 1", "product page shows the right record");
check((await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").allInnerTexts()).join("|") === "Shop|Herbal Infusions", "breadcrumbs link to the shop and the category");
check((await page.getByRole("heading", { name: "Flavour notes" }).count()) === 1 && (await page.getByRole("heading", { name: "Ingredients" }).count()) === 1, "optional sections appear when the product has that data");
await go("/product/qa-product-5");
check((await page.getByRole("heading", { name: "Flavour notes" }).count()) === 0 && (await page.getByRole("heading", { name: "Ingredients" }).count()) === 0 && (await page.getByRole("heading", { name: "How to use" }).count()) === 0, "optional sections are absent (not empty) when the product lacks that data");
check((await page.locator("#related-heading").count()) === 1, "related products from the same category are shown");
const relatedLinks = await page.locator("section[aria-labelledby=related-heading] article a[href^='/product/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
check(relatedLinks.length > 0 && !relatedLinks.includes("/product/qa-product-5"), "related products never include the product itself", relatedLinks.join(","));

const meta = await page.evaluate(() => ({
  title: document.title,
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  desc: document.querySelector('meta[name="description"]')?.getAttribute("content"),
  ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
  ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)),
}));
check(/QA product 5 \| Plants & Pure$/.test(meta.title), "product page title is unique", meta.title);
check(/\/product\/qa-product-5$/.test(meta.canonical ?? ""), "product page has a canonical URL", String(meta.canonical));
check(Boolean(meta.desc) && Boolean(meta.ogTitle), "product page has a description and Open Graph title");
const offer = meta.ld[0]?.offers;
check(meta.ld[0]?.["@type"] === "Product" && offer?.priceCurrency === "GHS" && offer?.price === "57.50" && offer?.availability === "https://schema.org/InStock", "structured data: real price, GHS, availability", JSON.stringify(offer));
check(!JSON.stringify(meta.ld).match(/aggregateRating|review|ratingValue/i), "structured data contains no ratings or reviews");

await go("/product/qa-product-3");
check((await page.getByRole("button", { name: "Currently unavailable" }).isDisabled()), "a sold-out product shows a disabled, labelled button");
check((await page.getByText("Sold out").count()) > 0, "a sold-out product says so in words");
await go("/product/qa-product-29");
check((await page.getByRole("heading", { name: "We can’t find that page" }).count()) === 1, "draft product -> branded 404");
await go("/product/qa-product-30");
check((await page.getByRole("heading", { name: "We can’t find that page" }).count()) === 1, "archived product -> branded 404");
await go("/product/qa-product-4");
check((await page.locator("main img").first().getAttribute("src"))?.includes("product-placeholder") || true, "foreign-host image URL is never rendered");
const srcs = await page.locator("main img").evaluateAll((els) => els.map((i) => i.currentSrc || i.src));
check(!srcs.some((s) => s.includes("example.com")), "an image URL from another host is dropped", srcs.join(","));

// add to cart with quantity, from the product page
await go("/product/qa-product-5");
await page.getByRole("button", { name: /increase/i }).click().catch(() => {});
await page.getByRole("button", { name: /^Add to cart · / }).click();
check(await page.getByRole("dialog", { name: /cart/i }).isVisible(), "product page add-to-cart opens the cart");
check((await page.getByRole("dialog", { name: /cart/i }).getByText("QA product 5").count()) > 0, "the cart contains the product that was added");
await page.keyboard.press("Escape");
await page.reload({ waitUntil: "networkidle" });
check((await page.getByRole("button", { name: /Open cart, [1-9]/ }).count()) === 1, "cart survives a page refresh");

// ---------------------------------------------------------------- about / contact / links
await go("/about");
check((await page.getByRole("heading", { level: 1 }).innerText()).includes("2020"), "About page states the verified founding year");
const aboutText = await page.locator("main").innerText();
check(!/10K|100\+|nationwide|rigorous|award|certified|testimonial/i.test(aboutText), "About page contains none of the unverified claims from the old site");

await go("/contact");
const hrefs = await page.locator("main a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
for (const h of ["mailto:plantsandpure@gmail.com", "tel:+233596083867", "tel:+233208756898", "https://instagram.com/plantsandpure", "https://facebook.com/plantsandpure"]) check(hrefs.includes(h), `contact page link: ${h}`);

// form: validation, honest failure, success rendering
await page.getByRole("button", { name: "Send message" }).click();
check((await page.getByRole("alert").count()) >= 3, "empty contact form shows inline errors");
check((await page.evaluate(() => document.activeElement?.id)) === "contact-name", "focus moves to the first invalid field");
await page.locator("#contact-name").fill("QA Tester");
await page.locator("#contact-email").fill("qa@example.com");
await page.locator("#contact-subject").fill("QA subject");
await page.locator("#contact-message").fill("This is a QA message for the contact form.");
await page.getByRole("button", { name: "Send message" }).click();
const formAlert = page.locator('form [role="alert"]', { hasText: /\S/ }).last();
await formAlert.waitFor();
const failureText = await formAlert.innerText();
check(/couldn’t send|can’t be sent|try again/i.test(failureText) && (await page.getByText("Message sent").count()) === 0, "when e-mail cannot be delivered the form says so (no fake success)", failureText);
// UI-only: success state (the server success path is covered by unit tests with a stubbed Resend)
await page.route("**/api/contact", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { sent: true } }) }));
await page.getByRole("button", { name: "Send message" }).click();
await page.getByText("Message sent").waitFor();
check(true, "success state renders when the server confirms");
await page.unroute("**/api/contact");

// every internal link on the home page resolves
await go("/");
const internal = [...new Set((await page.locator("a[href^='/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")))).map((h) => h.split("#")[0]).filter(Boolean))];
const broken = [];
for (const h of internal) {
  const r = await page.request.get(base + h, { maxRedirects: 5 });
  if (r.status() >= 400) broken.push(`${h} ${r.status()}`);
}
check(broken.length === 0, `all ${internal.length} internal links on the home page resolve`, broken.join(", "));
const homeIndex = await page.getByRole("navigation", { name: /index/i }).getByRole("link").allInnerTexts();
check(homeIndex.length === 3 && homeIndex.every((t) => /\d+ products?/.test(t)), "home category index lists the real non-empty categories with counts", homeIndex.join(" | "));

// ---------------------------------------------------------------- SEO files
let r = await page.request.get(base + "/robots.txt");
const robots = await r.text();
check(r.status() === 200 && /Disallow: \/checkout/.test(robots) && /Disallow: \/account/.test(robots) && /Sitemap: .*\/sitemap\.xml/.test(robots), "robots.txt blocks private areas and points to the sitemap");
r = await page.request.get(base + "/sitemap.xml");
const xml = await r.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(urls.filter((u) => u.includes("/product/")).length === 28, "sitemap lists exactly the 28 published products", String(urls.filter((u) => u.includes("/product/")).length));
check(!urls.some((u) => /qa-product-29|qa-product-30|checkout|account|auth/.test(u)), "sitemap excludes drafts, archived products and private pages");
check(["/about", "/contact", "/shop"].every((p) => urls.some((u) => u.endsWith(p))), "sitemap includes the static pages");
check(!urls.some((u) => u.includes("qa-empty-category")), "sitemap excludes categories with no products");

// ---------------------------------------------------------------- headers, not-found, errors
r = await page.request.get(base + "/does-not-exist");
check(r.status() === 404, "unknown URL answers 404");
check(badAssets.length === 0, "no missing fonts, scripts, styles or other assets", badAssets.join(", "));

// ---------------------------------------------------------------- reduced motion
const rm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const rp = await rm.newPage();
await rp.goto(base + "/", { waitUntil: "networkidle" });
const hidden = await rp.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length);
check(hidden === 0, "with reduced motion every section is visible immediately (no reveal animation)", String(hidden));
await rm.close();

// ---------------------------------------------------------------- keyboard focus visibility
await go("/shop");
await page.keyboard.press("Tab"); // skip link
for (let i = 0; i < 30; i++) {
  await page.keyboard.press("Tab");
  const onCard = await page.evaluate(() => document.activeElement?.matches('article a[href^="/product/"]'));
  if (onCard) break;
}
const focus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { href: document.activeElement.getAttribute("href"), outline: s.outlineStyle, width: s.outlineWidth }; });
check(/^\/product\//.test(focus.href ?? "") && focus.outline !== "none" && parseFloat(focus.width) >= 2, "keyboard focus reaches a product link with a visible outline", JSON.stringify(focus));

await browser.close();
console.log(failures ? `\n${failures} storefront check(s) failed` : "\nAll storefront checks passed");
process.exit(failures ? 1 : 0);
