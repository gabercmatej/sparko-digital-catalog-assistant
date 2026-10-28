import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogHref,
  catalogs,
  defaultLeaflet,
  getViewerCatalog,
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

  it("have unique ids that do not collide with the product-data catalogs", () => {
    const ids = viewerCatalogs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of catalogs) expect(homeLeaflets.some((l) => l.id === c.id)).toBe(false);
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
    expect(l.interactive).toBe(false);
  });

  it("have no offers or placements", () => {
    for (const id of ORDER) {
      expect(offers.some((o) => o.catalogId === id)).toBe(false);
      expect(placements.some((p) => p.catalogId === id)).toBe(false);
      expect(productsInCatalog(id)).toEqual([]);
    }
  });

  it("route /letak without a param only for the first leaflet", () => {
    expect(catalogHref(ORDER[0])).toBe("/letak");
    for (const id of ORDER.slice(1)) expect(catalogHref(id)).toBe(`/letak?katalog=${id}`);
  });

  it("links into the product catalogs carry katalog=", () => {
    const p = placements.find((pl) => pl.catalogId === "spar-4126")!;
    const productId = offers.find((o) => o.id === p.offerId)!.productId;
    expect(leafletHref(productId)).toContain("katalog=spar-4126");
  });

  it("viewer catalogs resolve all eight, interactive only for the data catalogs", () => {
    expect(viewerCatalogs.length).toBe(8);
    for (const c of viewerCatalogs) expect(getViewerCatalog(c.id)).toBeDefined();
    expect(viewerCatalogs.filter((c) => c.interactive).map((c) => c.id)).toEqual(catalogs.map((c) => c.id));
    expect(getViewerCatalog("nope")).toBeUndefined();
  });

  it("do not change the product-data model or the demo date", () => {
    expect(catalogs.length).toBe(2);
    expect(catalogs.map((c) => c.id)).toEqual(["spar-4126", "interspar-1426"]);
    const inRange = catalogs.some((c) => c.validFrom <= referenceDate() && referenceDate() <= c.validTo);
    expect(inRange).toBe(true);
    expect(referenceDate(new Date("2026-10-28T12:00:00Z"))).toBe(catalogs.map((c) => c.validFrom).sort()[0]);
    expect(offers.some((o) => isOfferCurrent(o))).toBe(true);
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
    expect(sendFromHome("   ")).toBe(false);
    expect(getState().conversations.length).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts a new user conversation when a demo is active (no fork)", () => {
    const demo = DEMO_CONVERSATIONS[0];
    setActiveConversation(demo.id);
    expect(sendFromHome("Koliko stane mleko?")).toBe(true);
    const s = getState();
    expect(s.activeConversationId).not.toBe(demo.id);
    const conv = getConversation(s.activeConversationId!)!;
    expect(conv.kind).toBe("user");
    expect(conv.forkedFrom).toBeUndefined();
    expect(conv.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conv.messages[0].text).toBe("Koliko stane mleko?");
    expect(conv.messages[1].status).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a conversation when none is active", () => {
    expect(sendFromHome("Živjo")).toBe(true);
    expect(getState().conversations.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("appends to the active user conversation, keeping history", () => {
    const cid = createConversation("Moj", [{ id: "m0", role: "user", createdAt: 1, text: "Prej", status: "ok" }]);
    expect(sendFromHome("Zdaj")).toBe(true);
    expect(getState().activeConversationId).toBe(cid);
    expect(getState().conversations.length).toBe(1);
    const conv = getConversation(cid)!;
    expect(conv.messages.map((m) => m.text).slice(0, 2)).toEqual(["Prej", "Zdaj"]);
    expect(conv.messages.length).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
