import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPrimaryOffer, products } from "@/lib/catalog";
import { futurePromos } from "@/lib/futurePromos";

const state = vi.hoisted(() => ({ nonCurrent: new Set<string>() }));
vi.mock("@/lib/promoCalendar", async (orig) => {
  const mod = await orig<typeof import("@/lib/promoCalendar")>();
  return { ...mod, isOfferCurrent: (o: { id: string }, now?: Date) => !state.nonCurrent.has(o.id) && mod.isOfferCurrent(o as never, now) };
});

import { collectionTotals } from "@/lib/savings";

type O = NonNullable<ReturnType<typeof getPrimaryOffer>>;
const withOffer = products.map((p) => ({ id: p.id, o: getPrimaryOffer(p.id)! })).filter((x) => !!x.o);
const isPack = (o: O) => o.priceUnit === "pack" || o.priceUnit === "kos";
const known = withOffer.filter((x) => isPack(x.o) && typeof x.o.regularPriceCents === "number" && x.o.regularPriceCents > x.o.priceCents);
const unknown = withOffer.filter((x) => isPack(x.o) && x.o.regularPriceCents == null);
const perKg = withOffer.filter((x) => x.o.priceUnit === "kg" || x.o.priceUnit === "100g");
const perKgKnown = perKg.filter((x) => typeof x.o.regularPriceCents === "number" && x.o.regularPriceCents > x.o.priceCents);
const perKgUnknown = perKg.filter((x) => x.o.regularPriceCents == null);
const plain = withOffer.filter((x) => isPack(x.o) && !x.o.conditions.spPlusRequired && x.o.priceKind !== "loyalty_price");
const plus = withOffer.filter((x) => isPack(x.o) && (x.o.conditions.spPlusRequired || x.o.priceKind === "loyalty_price"));

beforeEach(() => state.nonCurrent.clear());

describe("collectionTotals", () => {
  it("is all zeros for an empty collection", () => {
    expect(collectionTotals([])).toEqual({ totalCents: 0, savingsCents: 0, itemCount: 0, pricedCount: 0 });
  });

  it("adds and removes: total follows the saved set, integer cents", () => {
    const [a, b] = plain;
    const one = collectionTotals([a.id]);
    const two = collectionTotals([a.id, b.id]);
    expect(one.totalCents).toBe(a.o.priceCents);
    expect(two.totalCents).toBe(a.o.priceCents + b.o.priceCents);
    expect(collectionTotals([b.id]).totalCents).toBe(b.o.priceCents);
    expect(Number.isInteger(two.totalCents)).toBe(true);
    expect(collectionTotals([a.id, a.id]).itemCount).toBe(1);
  });

  it("savings = regular - price for verified regular prices", () => {
    expect(known.length).toBeGreaterThan(1);
    const [a, b] = known;
    const t = collectionTotals([a.id, b.id]);
    expect(t.savingsCents).toBe(a.o.regularPriceCents! - a.o.priceCents + (b.o.regularPriceCents! - b.o.priceCents));
  });

  it("never invents savings when the regular price is missing", () => {
    expect(unknown.length).toBeGreaterThan(0);
    const t = collectionTotals([unknown[0].id]);
    expect(t.savingsCents).toBe(0);
    expect(t.totalCents).toBe(unknown[0].o.priceCents);
  });

  it("never produces negative savings", () => {
    for (const x of withOffer) expect(collectionTotals([x.id]).savingsCents).toBeGreaterThanOrEqual(0);
  });

  it("uses SPAR plus prices as shown on the card", () => {
    expect(plus.length).toBeGreaterThan(0);
    const t = collectionTotals([plus[0].id, plain[0].id]);
    expect(t.totalCents).toBe(plus[0].o.priceCents + plain[0].o.priceCents);
  });

  it("includes per-kg offers at the shown price (1 kg / 100 g), with their savings", () => {
    expect(perKgKnown.length).toBeGreaterThan(0);
    const k = perKgKnown[0];
    const t = collectionTotals([k.id, plain[0].id]);
    expect(t.pricedCount).toBe(2);
    expect(t.itemCount).toBe(2);
    expect(t.totalCents).toBe(k.o.priceCents + plain[0].o.priceCents);
    expect(t.savingsCents).toBe(k.o.regularPriceCents! - k.o.priceCents + Math.max(0, (plain[0].o.regularPriceCents ?? 0) - plain[0].o.priceCents));
    const only = collectionTotals([k.id]);
    expect(only.totalCents).toBe(k.o.priceCents);
    expect(only.savingsCents).toBe(k.o.regularPriceCents! - k.o.priceCents);
  });

  it("per-kg offer without a regular price is in the total with 0 savings", () => {
    if (perKgUnknown.length === 0) return;
    const t = collectionTotals([perKgUnknown[0].id]);
    expect(t.totalCents).toBe(perKgUnknown[0].o.priceCents);
    expect(t.savingsCents).toBe(0);
  });

  it("mixed set (A with regular, B without, C per kg): total = sum of card prices, savings only from verified regular prices", () => {
    const A = known[0];
    const B = unknown[0];
    const C = perKg[0];
    const t = collectionTotals([A.id, B.id, C.id]);
    expect(t.totalCents).toBe(A.o.priceCents + B.o.priceCents + C.o.priceCents);
    const sv = (x: (typeof withOffer)[number]) => (typeof x.o.regularPriceCents === "number" ? Math.max(0, x.o.regularPriceCents - x.o.priceCents) : 0);
    expect(t.savingsCents).toBe(sv(A) + sv(B) + sv(C));
    expect(t.savingsCents).toBeGreaterThanOrEqual(0);
  });

  it("excludes non-current offers from both sums", () => {
    const a = known[0];
    state.nonCurrent.add(a.o.id);
    const other = plain.find((x) => x.id !== a.id)!;
    const t = collectionTotals([a.id, other.id]);
    expect(t.pricedCount).toBe(1);
    expect(t.totalCents).toBe(other.o.priceCents);
    expect(collectionTotals([a.id])).toMatchObject({ totalCents: 0, savingsCents: 0, pricedCount: 0 });
  });

  it("ignores future promos, even for products that have one", () => {
    const promo = futurePromos.find((p) => {
      const x = withOffer.find((w) => w.id === p.productId);
      return !!x && isPack(x.o) && p.priceCents !== x.o.priceCents;
    });
    expect(promo).toBeDefined();
    const x = withOffer.find((w) => w.id === promo!.productId)!;
    const t = collectionTotals([x.id]);
    expect(t.totalCents).toBe(x.o.priceCents);
    expect(t.totalCents).not.toBe(promo!.priceCents);
    const regular = x.o.regularPriceCents;
    expect(t.savingsCents).toBe(typeof regular === "number" ? Math.max(0, regular - x.o.priceCents) : 0);
  });
});
