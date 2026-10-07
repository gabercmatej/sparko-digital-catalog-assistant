import { expect, test, type Page } from "@playwright/test";

async function fresh(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });

/** The document never scrolls: programmatic scrolling bypasses overflow:hidden, so it exposes any real overflow. */
async function expectShellSealed(page: Page) {
  const r = await page.evaluate(() => {
    const se = document.scrollingElement!;
    window.scrollTo(0, 9999);
    const y = window.scrollY;
    window.scrollTo(0, 0);
    const box = (s: string) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null;
    return { sh: se.scrollHeight, sw: se.scrollWidth, ih: innerHeight, iw: innerWidth, y, header: box("header"), nav: box('nav[aria-label="Glavna navigacija"]') };
  });
  expect(r.sh).toBeLessThanOrEqual(r.ih);
  expect(r.sw).toBeLessThanOrEqual(r.iw);
  expect(r.y).toBe(0);
  expect(r.header!.top).toBeGreaterThanOrEqual(-0.5);
  if (r.nav) {
    expect(r.nav.bottom).toBeLessThanOrEqual(r.ih + 0.5);
    expect(r.nav.right).toBeLessThanOrEqual(r.iw + 0.5);
  }
  return r;
}

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 900 },
]) {
  test(`app shell ${vp.width}x${vp.height}: fills viewport, document never scrolls, initial chat fits`, async ({ page }) => {
    await page.setViewportSize(vp);
    await fresh(page);
    for (const path of ["/", "/moj-katalog", "/letak", "/domov"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectShellSealed(page);
    }
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const r = await expectShellSealed(page);
    const m = await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>('[data-testid="chat-scroll"]')!;
      const form = document.querySelector("form:has(#chat-input)")!.getBoundingClientRect();
      const starters = document.querySelector('ul[aria-label="Predlogi vprašanj"]')!.getBoundingClientRect();
      const shell = document.querySelector("main")!.parentElement!.getBoundingClientRect();
      return { sh: sc.scrollHeight, ch: sc.clientHeight, formTop: form.top, formBottom: form.bottom, startersBottom: starters.bottom, scBottom: sc.getBoundingClientRect().bottom, shellW: shell.width, shellH: shell.height };
    });
    // The initial screen fits: no inner scrolling needed either (two starters fully visible above the composer).
    expect(m.sh).toBeLessThanOrEqual(m.ch + 1);
    expect(m.startersBottom).toBeLessThanOrEqual(m.scBottom + 0.5);
    expect(m.formBottom).toBeLessThanOrEqual((r.nav?.top ?? r.ih) + 0.5);
    // Shell fills the whole available viewport (no centred max-width frame).
    expect(Math.abs(m.shellW - vp.width)).toBeLessThan(1);
    expect(Math.abs(m.shellH - vp.height)).toBeLessThan(1);
  });
}

test("long conversation scrolls only inside the message area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  const input = page.getByPlaceholder("Vprašaj Sparka o katalogu …");
  for (const q of ["Koliko stane skuta?", "Kaj je najbolj znižano?", "Predlagaj hiter zajtrk", "Večerja za dva do 10 €"]) {
    await input.fill(q);
    await input.press("Enter");
    await expect(chatLog(page).locator('[data-role="assistant"]').last()).not.toContainText("Sparko piše", { timeout: 15_000 });
  }
  await input.blur();
  const s = await page.getByTestId("chat-scroll").evaluate((el) => {
    el.scrollTop = 0;
    const a = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    return { sh: el.scrollHeight, ch: el.clientHeight, a, b: el.scrollTop };
  });
  expect(s.sh).toBeGreaterThan(s.ch);
  expect(s.b).toBeGreaterThan(s.a);
  await expectShellSealed(page);
  await expect(page.getByPlaceholder("Vprašaj Sparka o katalogu …")).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toBeInViewport();
});

test("simulated keyboard (viewport shrinks while typing): composer stays visible, nav hides, document fixed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Vprašaj Sparka o katalogu …").focus();
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toHaveCount(0);
  const r = await page.evaluate(() => ({ ih: innerHeight, f: document.querySelector("form:has(#chat-input)")!.getBoundingClientRect().bottom }));
  expect(r.f).toBeLessThanOrEqual(r.ih + 0.5);
  await expectShellSealed(page);
  await page.getByPlaceholder("Vprašaj Sparka o katalogu …").blur();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toBeVisible();
});

test("safe-area CSS and app-like metadata are in place", async ({ page }) => {
  await fresh(page);
  const meta = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
    // env() resolves to 0px in desktop Chromium, so check the shipped CSS text instead.
    safeCss: [...document.styleSheets]
      .flatMap((sh) => {
        try {
          return [...sh.cssRules].map((r) => r.cssText);
        } catch {
          return [];
        }
      })
      .join(" "),
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    shellPos: getComputedStyle(document.querySelector("main")!.parentElement!).position,
  }));
  expect(meta.viewport).toContain("viewport-fit=cover");
  expect(meta.viewport).toContain("interactive-widget=resizes-content");
  expect(meta.manifest).toBeTruthy();
  expect(meta.safeCss).toContain("safe-area-inset-bottom");
  expect(meta.safeCss).toContain("safe-area-inset-top");
  expect(meta.htmlOverflow).toBe("hidden");
  expect(meta.shellPos).toBe("fixed");
  const res = await page.request.get(meta.manifest!);
  expect(res.ok()).toBe(true);
  expect((await res.json()).display).toBe("standalone");
});
