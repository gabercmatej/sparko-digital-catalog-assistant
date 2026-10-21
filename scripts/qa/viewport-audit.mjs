// Viewport / visual QA harness. Usage: node scripts/qa/viewport-audit.mjs
// Env: QA_BASE_URL (default http://localhost:3000), QA_OUT (screenshot dir).
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUT = process.env.QA_OUT ?? "C:/Users/Maj/AppData/Local/Temp/claude/sparko-qa";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  [320, 568], [360, 640], [375, 667], [390, 844], [393, 852], [430, 932], [1440, 900], [390, 664], [360, 560],
];

const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "src/data/catalog.json"), "utf8"));
const seeded = [];
for (const c of catalog.catalogs) {
  const offers = catalog.offers.filter((o) => o.catalogId === c.id).slice(0, 3);
  for (const o of offers) seeded.push({ productId: o.productId, offerId: o.id, savedAt: 1_700_000_000_000 + seeded.length });
}
const SEED = { v: 1, saved: seeded, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } };

/** Runs in the page: measures everything, tolerant of missing selectors. */
function measure(isHome) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { missing: [], notes: [] };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const inView = (r) => r.x >= -0.5 && r.y >= -0.5 && r.r <= vw + 0.5 && r.b <= vh + 0.5;
  const root = document.documentElement;
  out.doc = { scrollHeight: root.scrollHeight, innerHeight: vh, scrolls: root.scrollHeight > vh + 1, scrollWidth: root.scrollWidth, hOverflow: root.scrollWidth > vw };
  const hr = document.querySelector("[data-home-root]");
  out.homeRoot = !isHome ? null : hr ? { scrollHeight: hr.scrollHeight, clientHeight: hr.clientHeight, needsScroll: hr.scrollHeight > hr.clientHeight + 1 } : (out.missing.push("[data-home-root]"), null);
  const nav = document.querySelector('nav[aria-label="Glavna navigacija"]');
  const navR = nav ? rectOf(nav) : (out.missing.push("bottom nav"), null);
  const vis = {};
  const check = (name, sel, all = false) => {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) { out.missing.push(name + " (" + sel + ")"); vis[name] = null; return els; }
    const rs = els.map(rectOf);
    vis[name] = (all ? rs : rs.slice(0, 1)).every(inView) && rs.every((r) => r.w > 0 && r.h > 0);
    if (rs.length && all) vis[name + ".count"] = rs.length;
    return els;
  };
  check("header", "header");
  if (isHome) {
  check("tablist", '[role=tablist][aria-label="Prikaz"]');
  const cards = check("catalogCards", "[data-catalog-card]", true);
  check("mascot", '[data-home-zone="mascot"] img');
  const actions = check("actions", '[data-home-zone="actions"] button', true);
  vis["actions.countIs4"] = actions.length === 4;
  const rail = document.querySelector('[data-testid="home-rail"] li');
  if (!rail) out.missing.push("home-rail li");
  else {
    const r = rectOf(rail);
    vis.railFirst = inView(r) && (!navR || r.b <= navR.y + 0.5);
    out.railFirstRect = r;
  }
  if (navR) vis.bottomNav = inView(navR);
  const tab = document.querySelector('[role=tablist][aria-label="Prikaz"]');
  if (tab && cards[0]) vis.tablistAboveCards = rectOf(tab).y < rectOf(cards[0]).y;
  }
  out.visible = vis;
  const inClipper = (e) => { for (let p = e.parentElement; p && p !== document.body && p !== root; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  const clipped = [...document.querySelectorAll("button, a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5) && !inClipper(e); }).length;
  out.clippedHoriz = clipped;
  const pills = [...document.querySelectorAll("[data-price-pill]")];
  out.pills = { count: pills.length, nonZeroRadius: pills.map((p) => ({ tone: p.getAttribute("data-price-pill"), radius: getComputedStyle(p).borderRadius })).filter((p) => p.radius.split(" ").some((v) => parseFloat(v) !== 0)).slice(0, 5) };
  return out;
}

const pages = [
  { name: "domov", url: "/domov", full: true },
  { name: "chat", url: "/" },
  { name: "moj-katalog", url: "/moj-katalog", seed: true },
];

const browser = await chromium.launch();
const results = [];
for (const [w, h] of VIEWPORTS) {
  const mobile = w < 500;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  for (const pg of pages) {
    const page = await ctx.newPage();
    const rec = { vp: `${w}x${h}`, page: pg.name };
    try {
      if (pg.seed) await page.addInitScript((s) => { try { localStorage.setItem("sparko:v2", JSON.stringify(s)); } catch {} }, SEED);
      await page.goto(BASE + pg.url, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(900);
      Object.assign(rec, await page.evaluate(measure, pg.name === "domov"));
      await page.screenshot({ path: path.join(OUT, `${pg.name}-${w}x${h}.png`) }).catch((e) => (rec.shotError = String(e)));
    } catch (e) {
      rec.error = String(e).slice(0, 200);
    }
    results.push(rec);
    await page.close();
  }
  await ctx.close();
}
await browser.close();

writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(results, null, 1));

// Compact summary
const flag = (b) => (b === true ? "ok" : b === false ? "NO" : "--");
console.log(`Base ${BASE}  out ${OUT}\n`);
console.log("viewport  page         docScroll homeScroll hdr tabs cards mascot act4 rail nav tabAbove clipX pillsNonZero missing");
for (const r of results) {
  if (r.error) { console.log(`${r.vp.padEnd(9)} ${r.page.padEnd(12)} ERROR ${r.error}`); continue; }
  const v = r.visible ?? {};
  console.log(
    [
      r.vp.padEnd(9), r.page.padEnd(12),
      (r.doc?.scrolls ? "SCROLL" : "no").padEnd(9),
      (r.homeRoot ? (r.homeRoot.needsScroll ? `YES ${r.homeRoot.scrollHeight}/${r.homeRoot.clientHeight}` : "no") : "--").padEnd(10),
      flag(v.header).padEnd(3), flag(v.tablist).padEnd(4), flag(v.catalogCards).padEnd(5), flag(v.mascot).padEnd(6),
      flag(v["actions"] && v["actions.countIs4"]).padEnd(4), flag(v.railFirst).padEnd(4), flag(v.bottomNav).padEnd(3),
      flag(v.tablistAboveCards).padEnd(8), String(r.clippedHoriz).padEnd(5), String(r.pills?.nonZeroRadius.length ?? "--").padEnd(13),
      (r.missing ?? []).join("; "),
    ].join(" "),
  );
}
const bad = results.flatMap((r) => (r.pills?.nonZeroRadius ?? []).map((p) => `${r.vp} ${r.page} ${p.tone} ${p.radius}`));
if (bad.length) console.log("\nNon-zero price pill radii:\n" + [...new Set(bad)].join("\n"));
console.log(`\nFull JSON: ${path.join(OUT, "audit.json")}`);
