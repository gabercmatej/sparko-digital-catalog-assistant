import { describe, expect, it } from "vitest";
import { activeProducts } from "@/lib/activeCatalog";
import { catalogs, getPrimaryOffer, getProduct, offers, products } from "@/lib/catalog";
import { allForecasts, DEMO_FORECAST_LABEL, forecastFor } from "@/lib/demoForecast";
import { futurePromosForProduct } from "@/lib/futurePromos";
import { isOfferCurrent, isPromoUpcoming, ljubljanaDate, referenceDate, upcomingWindow } from "@/lib/promoCalendar";
import { rankDiscounts } from "@/lib/assistant/discounts";
import { detectIntent } from "@/lib/assistant/intents";
import { handleChat } from "@/lib/assistant/orchestrate";
import { buildDeterministicReply } from "@/lib/assistant/respond";
import { ASK_TIMING_PRODUCT_TEXT, STARTER_PROMPTS } from "@/lib/assistant/starters";
import { validateModelOutput } from "@/lib/assistant/validate";
import { sanitizeBlocks } from "@/lib/chat/messages";
import type { ChatRequest, ChatRequestMessage, ChatResponse, MessageBlock } from "@/lib/types";

function req(text: string, history: ChatRequestMessage[] = []): ChatRequest {
  return { conversationId: "t", messages: [...history, { role: "user", text }], savedProductIds: [], spPlus: "unset" };
}
type Timeline = Extract<MessageBlock, { type: "discount_timeline" }>;
const timelineOf = (r: { blocks: MessageBlock[] }) => r.blocks.find((b): b is Timeline => b.type === "discount_timeline");
const productCards = (r: { blocks: MessageBlock[] }) => r.blocks.filter((b) => b.type === "products");
// Data-driven anchors: a current product with a structured (simulated) next-week promo, and a current dairy product.
const PROMO_PRODUCT = activeProducts().find((p) => futurePromosForProduct(p.id).length > 0)!;
const DAIRY = activeProducts().find((p) => p.categories[0] === "mlecni-izdelki")!;

/** The conversation "Kdaj bo izdelek najbolj znižan?" -> ask -> user reply. */
function afterAsk(reply: string): ChatRequest {
  return req(reply, [
    { role: "user", text: "Kdaj bo izdelek najbolj znižan?" },
    { role: "assistant", text: ASK_TIMING_PRODUCT_TEXT },
  ]);
}

describe("starters", () => {
  it("the 4th starter is the generic timing question", () => {
    expect(STARTER_PROMPTS[3]).toEqual({ label: "Kdaj bo izdelek najbolj znižan?", message: "Kdaj bo izdelek najbolj znižan?" });
    expect(STARTER_PROMPTS).toHaveLength(4);
  });
});

describe("generic timing question asks for the product first", () => {
  it("replies exactly with the follow-up and never uses the model", () => {
    const r = buildDeterministicReply(req("Kdaj bo izdelek najbolj znižan?"));
    expect(r.intent).toBe("discount_timing");
    expect(r.kind).toBe("ask_timing_product");
    expect(r.text).toBe("Seveda! Za kateri izdelek te zanima, kdaj bo v akciji?");
    expect(r.blocks).toEqual([]);
    expect(r.allowModel).toBe(false);
  });

  it("asks even when an earlier answer left product context (the word 'izdelek' is generic)", () => {
    const first = products[0];
    const r = buildDeterministicReply(req("Kdaj bo izdelek najbolj znižan?", [{ role: "user", text: "x", contextProductIds: [first.id] }, { role: "assistant", text: "y", contextProductIds: [first.id] }]));
    expect(r.kind).toBe("ask_timing_product");
  });

  it("the follow-up also works in live AI mode (decided before the model is called)", async () => {
    let called = false;
    const provider = {
      name: "mock",
      model: "mock",
      generate: async () => {
        called = true;
        return { text: "x", productIds: [] };
      },
    };
    const res = await handleChat(req("Kdaj bo izdelek najbolj znižan?"), { provider });
    expect(res.status).toBe(200);
    const body = res.body as ChatResponse;
    expect(body.mode).toBe("deterministic");
    expect(body.message.text).toBe(ASK_TIMING_PRODUCT_TEXT);
    expect(called).toBe(false);
  });
});

describe("product reply after the follow-up is a timing query", () => {
  it("'Perutnina Ptuj izdelki' returns Perutnina Ptuj products in the forecast timeline", () => {
    const r = buildDeterministicReply(afterAsk("Perutnina Ptuj izdelki"));
    expect(r.intent).toBe("discount_timing");
    expect(r.text).toBe("Izdelki Perutnine Ptuj bodo v naši demo napovedi znižani naslednji teden. Poglej, kateri izdelki so vključeni.");
    const tl = timelineOf(r)!;
    const ptuj = products.filter((p) => p.brand === "Perutnina Ptuj").map((p) => p.id);
    const shown = [...tl.upcomingPromoIds.map((id) => futurePromoProduct(id)), ...(tl.forecastProductIds ?? [])];
    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown)).toEqual(new Set(ptuj.filter((id) => allForecasts().some((f) => f.productId === id))));
    expect(r.allowModel).toBe(false);
  });

  it.each([PROMO_PRODUCT.name, PROMO_PRODUCT.name.toLowerCase(), DAIRY.name, "mleko"])("'%s' resolves to a product timing answer", (reply) => {
    const r = buildDeterministicReply(afterAsk(reply));
    expect(r.intent).toBe("discount_timing");
    const tl = timelineOf(r)!;
    expect(tl).toBeTruthy();
    expect(tl.upcomingPromoIds.length + (tl.forecastProductIds?.length ?? 0)).toBeGreaterThan(0);
    expect(r.text).toContain("demo napovedi");
    expect(r.text).not.toMatch(/\{\{|\}\}/);
  });

  it("an unrecognized product gets an honest answer and NO product cards", () => {
    const r = buildDeterministicReply(afterAsk("kaviar iz jesetra"));
    expect(r.intent).toBe("unknown_product");
    expect(productCards(r)).toEqual([]);
    expect(timelineOf(r)).toBeUndefined();
    expect(r.contextProductIds).toEqual([]);
    expect(r.text).toContain("ne najdem");
    expect(r.allowModel).toBe(false);
  });

  it("works unchanged through the live-AI orchestration", async () => {
    const provider = { name: "mock", model: "mock", generate: async () => ({ text: "ignored", productIds: [] }) };
    const res = await handleChat(afterAsk("Perutnina Ptuj izdelki"), { provider });
    const body = res.body as ChatResponse;
    expect(body.mode).toBe("deterministic");
    expect(body.message.blocks.some((b) => b.type === "discount_timeline")).toBe(true);
  });

  it("a different question after the follow-up is not hijacked", () => {
    expect(buildDeterministicReply(afterAsk("Kaj je najbolj znižano?")).intent).toBe("discounts");
    expect(buildDeterministicReply(afterAsk("Kje je meni najbližji SPAR?")).intent).toBe("nearest_store");
  });
});

function futurePromoProduct(promoId: string): string {
  const p = products.flatMap((x) => futurePromosForProduct(x.id)).find((f) => f.id === promoId)!;
  return p.productId;
}

describe("named-product timing questions skip the follow-up", () => {
  it.each([`Kdaj bo ${PROMO_PRODUCT.name} cenejši?`, "Bo piščanec naslednji teden v akciji?", "Kdaj je Perutnina Ptuj znižana?", "Ali bo Perutnina Ptuj naslednji teden znižana?", "Kdaj bo piščanec v akciji?"])(
    "%s answers directly",
    (text) => {
      const r = buildDeterministicReply(req(text));
      expect(r.intent).toBe("discount_timing");
      expect(r.kind).not.toBe("ask_timing_product");
      expect(timelineOf(r)).toBeTruthy();
      expect(r.text).not.toBe(ASK_TIMING_PRODUCT_TEXT);
    },
  );
});

describe("timing vs. discount intent detection", () => {
  const timing = [
    "Kdaj je Perutnina Ptuj znižana?",
    "Kdaj bo piščanec v akciji?",
    "Ali bo Perutnina Ptuj naslednji teden znižana?",
    "Kaj bo znižano naslednji teden?",
    "Kateri izdelki bodo kmalu v akciji?",
    "Se mi splača počakati na akcijo?",
    `Kdaj bo ${PROMO_PRODUCT.name} cenejši?`,
    "Bo piščanec naslednji teden v akciji?",
    "Kdaj se splača kupiti ta izdelek?",
    "Kdaj bo izdelek najbolj znižan?",
  ];
  const discounts = [
    "Kaj je najbolj znižano?",
    "Kaj je najbolj znižano v katalogu?",
    "Pokaži največje popuste.",
    "Kateri izdelki so trenutno najbolj znižani?",
    "Kaj je zdaj v akciji?",
    "Pokaži trenutne akcije.",
  ];
  it.each(timing)("%s -> discount_timing", (t) => expect(detectIntent(req(t).messages).intent).toBe("discount_timing"));
  it.each(discounts)("%s -> discounts", (t) => expect(detectIntent(req(t).messages).intent).toBe("discounts"));
});

describe("generic discount questions show ONLY current offers", () => {
  const phrasings = ["Kaj je najbolj znižano?", "Kaj je najbolj znižano v katalogu?", "Pokaži največje popuste.", "Kateri izdelki so trenutno najbolj znižani?", "Kaj je zdaj v akciji?", "Pokaži trenutne akcije."];

  it.each(phrasings)("%s", (text) => {
    const r = buildDeterministicReply(req(text));
    expect(r.intent).toBe("discounts");
    const tl = timelineOf(r)!;
    expect(tl.currentOfferIds).toEqual(rankDiscounts({ limit: 4 }).map((x) => x.offer.id));
    expect(tl.currentOfferIds.length).toBeGreaterThan(0);
    expect(tl.upcomingPromoIds).toEqual([]);
    expect(tl.forecastProductIds).toBeUndefined();
    expect(r.candidatePromoIds).toEqual([]);
    expect(r.text).not.toMatch(/naslednj|prihodnj|napoved|\{\{/i);
  });

  it.each(phrasings)("live AI mode: %s gives the same blocks, and the model cannot add upcoming promos", async (text) => {
    const det = buildDeterministicReply(req(text));
    const goodModel = { name: "mock", model: "mock", generate: async () => ({ text: "Takole izgleda ponudba v katalogu.", productIds: [] }) };
    const live = (await handleChat(req(text), { provider: goodModel })).body as ChatResponse;
    expect(live.mode).toBe("live");
    expect(live.message.blocks).toEqual(det.blocks);

    // A model that smuggles in the next week (words, or the period placeholder) is rejected -> deterministic fallback with identical blocks.
    for (const bad of ["Naslednji teden bo še več akcij.", "Napovedane akcije so ob {{futurePeriod}}."]) {
      const provider = { name: "mock", model: "mock", generate: async () => ({ text: bad, productIds: [] }) };
      const res = (await handleChat(req(text), { provider })).body as ChatResponse;
      expect(res.mode).toBe("fallback");
      expect(res.message.blocks).toEqual(det.blocks);
      expect(timelineOf(res.message)?.upcomingPromoIds ?? []).toEqual([]);
    }
  });

  it("validator rejects a futurePeriod placeholder when the draft has no upcoming promos", () => {
    const draft = buildDeterministicReply(req("Kaj je najbolj znižano?"));
    expect(validateModelOutput({ text: "Glej {{futurePeriod}}.", productIds: [] }, draft).ok).toBe(false);
    expect(validateModelOutput({ text: "Glej ponudbo.", productIds: [] }, draft).ok).toBe(true);
  });
});

describe("demo forecast layer", () => {
  // the forecast covers the current offers (one per article), never expired ones
  const verified = activeProducts().filter((p) => getPrimaryOffer(p.id)?.verification.status === "verified");

  it("covers every current verified product, with the upcoming period", () => {
    const all = allForecasts();
    expect(verified.length).toBeGreaterThan(0);
    expect(all.map((f) => f.productId).sort()).toEqual(verified.map((p) => p.id).sort());
    const window = upcomingWindow();
    for (const p of verified) {
      const f = forecastFor(p.id)!;
      expect(f.currentOfferId).toBe(getPrimaryOffer(p.id)!.id);
      expect(f.period.from >= window.from && f.period.to <= window.to).toBe(true);
      // after the general validity of the primary catalog (SPAR 44/26)
      expect(f.period.from > catalogs[0].validTo).toBe(true);
    }
  });

  it("never invents a price: only products with a structured promo carry one", () => {
    for (const f of allForecasts()) {
      const structured = futurePromosForProduct(f.productId);
      if (structured.length) expect(f.promo).toEqual(structured[0]);
      else expect(f.promo).toBeNull();
    }
    expect(forecastFor("does-not-exist")).toBeUndefined();
  });

  it("every verified product can be asked about and answered; no future price/percent appears in text or blocks without a structured promo", () => {
    // Names that embed their brand ("Torte Slaščice SPAR") are read as a brand filter first; they are asked by brand elsewhere.
    const embedsLabel = (x: (typeof verified)[number]) => [x.brand].some((l) => !!l && x.name.toLowerCase().includes(l.toLowerCase()));
    for (const p of verified.filter((x) => !embedsLabel(x))) {
      const r = buildDeterministicReply(afterAsk(p.name));
      expect(r.intent, p.name).toBe("discount_timing");
      const tl = timelineOf(r);
      expect(tl, p.name).toBeTruthy();
      const covered = new Set([...tl!.upcomingPromoIds.map(futurePromoProduct), ...(tl!.forecastProductIds ?? [])]);
      // several current articles may share a name (e.g. "Torte" in two catalogs): an answer about a same-named one counts
      const sameName = [...covered, ...r.candidateProductIds].some((id) => getProduct(id)?.name === p.name);
      expect(covered.has(p.id) || r.candidateProductIds.includes(p.id) || sameName, p.name).toBe(true);
      // no unresolved placeholder, no price / percentage (product names may carry "0 %", so strip them first)
      expect(r.text.split(p.name).join(" ").replace(/\d+([,.]\d+)? ?% (alk|m\. ?m\.)\S*/gi, " ")).not.toMatch(/\{\{|\}\}|€/);
      for (const id of tl!.forecastProductIds ?? []) expect(futurePromosForProduct(id)).toEqual([]);
    }
  }, 60_000); // walks every current verified product (~350 deterministic replies)

  it("is marked as a demo", () => {
    expect(DEMO_FORECAST_LABEL).toBe("Demo napoved");
  });

  it("sanitizeBlocks keeps valid forecast ids only", () => {
    const id = verified[0].id;
    const out = sanitizeBlocks([{ type: "discount_timeline", currentOfferIds: [], upcomingPromoIds: [], forecastProductIds: [id, "nope"] }, { type: "discount_timeline", currentOfferIds: [], upcomingPromoIds: [], forecastProductIds: ["nope"] }]);
    expect(out).toEqual([{ type: "discount_timeline", currentOfferIds: [], upcomingPromoIds: [], forecastProductIds: [id] }]);
    expect(getProduct(id)).toBeTruthy();
  });
});

describe("promoCalendar date logic", () => {
  const spanFrom = offers.map((o) => o.validity.from!).sort()[0];
  const newestStart = catalogs.map((c) => c.validFrom).sort().reverse()[0];
  const at = (iso: string, hour = 12) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00+01:00`);

  it("uses the real date (Europe/Ljubljana) while it lies inside the span of the offers", () => {
    expect(referenceDate(at("2026-10-29"))).toBe("2026-10-29");
    expect(referenceDate(at("2026-11-03", 23))).toBe("2026-11-03");
    // 00:30 local time is still the previous UTC day: the local calendar day must win.
    expect(ljubljanaDate(new Date("2026-10-28T00:30:00+01:00"))).toBe("2026-10-28");
  });

  it("falls back to the earliest offer start before the span and to the newest catalog start after it", () => {
    expect(referenceDate(new Date("2020-01-01T10:00:00Z"))).toBe(spanFrom);
    expect(referenceDate(new Date("2030-01-01T10:00:00Z"))).toBe(newestStart);
  });

  it("current offers are valid on the reference date; none is current once it falls outside its own window", () => {
    const offer = getPrimaryOffer(products[0].id)!;
    expect(isOfferCurrent(offer, at("2026-10-29"))).toBe(true);
    expect(isOfferCurrent(offer, at("2026-11-04"))).toBe(offer.validity.to! >= "2026-11-04");
    expect(isOfferCurrent({ ...offer, validity: { ...offer.validity, from: "2026-11-05", to: "2026-11-07" } }, at("2026-10-29"))).toBe(false);
    expect(rankDiscounts({ now: at("2026-10-29"), limit: 50 }).length).toBeGreaterThan(0);
  });

  it("upcoming promos start after the reference date and after their product's current offer", () => {
    const window = upcomingWindow();
    expect(window.from > catalogs[0].validTo).toBe(true);
    expect(window.to >= window.from).toBe(true);
    const promo = futurePromosForProduct(PROMO_PRODUCT.id)[0];
    expect(promo.validFrom > getPrimaryOffer(PROMO_PRODUCT.id)!.validity.to!).toBe(true);
    expect(isPromoUpcoming(promo, at("2026-10-29"))).toBe(true);
    expect(isPromoUpcoming({ validFrom: "2026-10-28" }, at("2026-10-29"))).toBe(false);
  });
});
