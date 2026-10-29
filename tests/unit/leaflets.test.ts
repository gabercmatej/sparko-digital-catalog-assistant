import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogHref,
  catalogs,
  defaultLeaflet,
  getViewerCatalog,
  historical,
  historicalCatalogs,
  homeLeaflets,
  leafletHref,
  offers,
  placements,
  productsInCatalog,
  viewerCatalogs,
} from "@/lib/catalog";
import { isOfferCurrent, referenceDate } from "@/lib/promoCalendar";
import { sendFromHome } from "@/lib/chat/useChat";
import { DEMO_CONVERSATIONS } from "@/lib/demo-conversations";
import { __resetForTests, createConversation, getConversation, getState, setActiveConversation } from "@/lib/store/store";

const ORDER = ["spar-4426", "interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326"];

describe("home leaflets", () => {
  it("are exactly six, in Home order, default first", () => {
    expect(homeLeaflets.map((l) => l.id)).toEqual(ORDER);
    expect(defaultLeaflet.id).toBe("spar-4426");
  });

  it("cover four distinct categories", () => {
    expect(homeLeaflets.map((l) => l.category)).toEqual(["spar", "interspar", "spar-online", "despar", "spar", "spar"]);
    expect(new Set(homeLeaflets.map((l) => l.category)).size).toBe(4);
  });

  it("have unique ids; the Home leaflets are exactly the current product-data catalogs, historical ones are separate and flagged", () => {
    const ids = viewerCatalogs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(homeLeaflets.map((l) => l.id).sort()).toEqual(catalogs.map((c) => c.id).sort());
    for (const c of historicalCatalogs) {
      expect(homeLeaflets.some((l) => l.id === c.id)).toBe(false);
      expect(getViewerCatalog(c.id)).toMatchObject({ historical: true, homeOrder: null });
    }
    for (const l of homeLeaflets) expect(l.historical).toBe(false);
  });

  it.each(ORDER)("%s has consistent pages, pdf and cover", (id) => {
    const l = getViewerCatalog(id)!;
    expect(l.pageCount).toBeGreaterThan(0);
    expect(l.pages.length).toBe(l.pageCount);
    l.pages.forEach((p, i) => {
      expect(p.pdfPageIndex).toBe(i);
      expect(p.image.src).toContain(`/catalog/${id}/`);
      expect(p.thumb.src).toContain(`/catalog/${id}/`);
    });
    expect(l.pdfUrl).toBe(`/catalog/${id}/katalog.pdf`);
    expect(l.cover.src.startsWith(`/catalog/${id}/`)).toBe(true);
    expect(l.validFrom <= l.validTo).toBe(true);
    expect(l.interactive).toBe(true);
    expect(l.historical).toBe(false);
  });

  it("are all interactive: each has offers, placements and products of its own", () => {
    for (const id of ORDER) {
      expect(offers.some((o) => o.catalogId === id), id).toBe(true);
      expect(placements.some((p) => p.catalogId === id), id).toBe(true);
      expect(productsInCatalog(id).length, id).toBeGreaterThan(0);
    }
  });

  it("route /letak without a param only for the first leaflet", () => {
    expect(catalogHref(ORDER[0])).toBe("/letak");
    for (const id of ORDER.slice(1)) expect(catalogHref(id)).toBe(`/letak?katalog=${id}`);
  });

  it("links into the product catalogs carry katalog= unless the product is in the default leaflet", () => {
    const other = placements.find((pl) => pl.catalogId !== defaultLeaflet.id)!;
    const otherProduct = offers.find((o) => o.id === other.offerId)!.productId;
    expect(leafletHref(otherProduct)).toContain(`katalog=${other.catalogId}`);
    expect(leafletHref(otherProduct)).toContain(`izdelek=${otherProduct}`);
    const def = placements.find((pl) => pl.catalogId === defaultLeaflet.id)!;
    const defProduct = offers.find((o) => o.id === def.offerId)!.productId;
    expect(leafletHref(defProduct)).not.toContain("katalog=");
    expect(leafletHref(defProduct)).toContain(`stran=${def.pdfPageNumber}`);
  });

  it("links to saved historical products open the historical leaflet", () => {
    const pl = historical.placements[0];
    expect(pl).toBeDefined();
    const productId = historical.offers.find((o) => o.id === pl.offerId)!.productId;
    expect(leafletHref(productId)).toContain(`katalog=${pl.catalogId}`);
  });

  it("viewer catalogs resolve: the six current ones first, then the historical ones; all have placements and are interactive", () => {
    expect(viewerCatalogs.length).toBe(homeLeaflets.length + historicalCatalogs.length);
    expect(viewerCatalogs.slice(0, ORDER.length).map((c) => c.id)).toEqual(ORDER);
    for (const c of viewerCatalogs) {
      expect(getViewerCatalog(c.id)).toBeDefined();
      expect([...placements, ...historical.placements].some((p) => p.catalogId === c.id), c.id).toBe(true);
      expect(c.interactive, c.id).toBe(true);
    }
    expect(getViewerCatalog("nope")).toBeUndefined();
  });

  it("historical catalogs are never current: they end before the reference date and none of their offers is valid", () => {
    const ref = referenceDate();
    for (const c of historicalCatalogs) expect(c.validTo < ref, c.id).toBe(true);
    for (const o of historical.offers) expect(isOfferCurrent(o), o.id).toBe(false);
    expect(offers.some((o) => historicalCatalogs.some((c) => c.id === o.catalogId))).toBe(false);
  });

  it("reference date: the real Ljubljana date inside the offers' span, the earliest start before it, the newest catalog start after it", () => {
    const starts = catalogs.map((c) => c.validFrom).sort();
    const today = new Date("2026-10-28T12:00:00Z");
    expect(referenceDate(today)).toBe("2026-10-28");
    expect(referenceDate(new Date("2020-01-01T12:00:00Z")) <= starts[0]).toBe(true);
    expect(referenceDate(new Date("2030-01-01T12:00:00Z"))).toBe(starts[starts.length - 1]);
    expect(offers.some((o) => isOfferCurrent(o, today))).toBe(true);
    expect(catalogs.some((c) => c.validFrom <= referenceDate(today) && referenceDate(today) <= c.validTo)).toBe(true);
  });
});

describe("sendFromHome", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetForTests();
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ignores empty text", () => {
    expect(sendFromHome("   ")).toBeNull();
    expect(getState().conversations.length).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts a new user conversation when a demo is active (no fork)", () => {
    const demo = DEMO_CONVERSATIONS[0];
    setActiveConversation(demo.id);
    const id = sendFromHome("Koliko stane mleko?");
    expect(id).toBeTruthy();
    const s = getState();
    expect(s.activeConversationId).toBe(id);
    const conv = getConversation(id!)!;
    expect(conv.kind).toBe("user");
    expect(conv.forkedFrom).toBeUndefined();
    expect(conv.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conv.messages[0].text).toBe("Koliko stane mleko?");
    expect(conv.messages[1].status).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a conversation when none is active", () => {
    expect(sendFromHome("Živjo")).toBeTruthy();
    expect(getState().conversations.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("always starts a NEW conversation, leaving the active one untouched in history", () => {
    const old = createConversation("Kava", [{ id: "m0", role: "user", createdAt: 1, text: "Kaj je s kavo?", status: "ok" }]);
    const id = sendFromHome("Koliko stane mleko?")!;
    expect(id).not.toBe(old);
    expect(getState().activeConversationId).toBe(id);
    expect(getState().conversations.map((c) => c.id)).toEqual([id, old]);
    expect(getConversation(old)!.messages.map((m) => m.text)).toEqual(["Kaj je s kavo?"]);
    const conv = getConversation(id)!;
    expect(conv.messages.map((m) => m.text)[0]).toBe("Koliko stane mleko?");
    expect(conv.messages.length).toBe(2);
    expect(conv.title).toBe("Koliko stane mleko?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("each Home question is its own conversation with exactly one request", () => {
    const a = sendFromHome("Prvo")!;
    const b = sendFromHome("Drugo")!;
    expect(a).not.toBe(b);
    expect(getState().conversations.length).toBe(2);
    expect(getConversation(a)!.messages.length).toBe(2);
    expect(getConversation(b)!.messages.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts a new conversation even while the active one is still waiting for its answer", () => {
    const first = sendFromHome("Prvo")!;
    const second = sendFromHome("Drugo")!;
    expect(getConversation(first)!.messages[1].status).toBe("pending");
    expect(getState().activeConversationId).toBe(second);
  });
});
