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
const plain = withOffer.filter((x) => isPack(x.o) && !x.o.conditions.spPlusRequired && x.o.priceKind !== "loyalty_price");
const plus = withOffer.filter((x) => isPack(x.o) && (x.o.conditions.spPlusRequired || x.o.priceKind === "loyalty_price"));

beforeEach(() => state.nonCurrent.clear());

describe("collectionTotals", () => {
  it("is all zeros for an empty collection", () => {
    expect(collectionTotals([])).toEqual({ totalCents: 0, savingsCents: 0, itemCount: 0, pricedCount: 0, excludedPerKg: 0, savingsKnownCount: 0, savingsUnknownCount: 0, spPlusCount: 0 });
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
    expect(t.savingsKnownCount).toBe(2);
    expect(t.savingsUnknownCount).toBe(0);
  });

  it("never invents savings when the regular price is missing", () => {
    expect(unknown.length).toBeGreaterThan(0);
    const t = collectionTotals([unknown[0].id]);
    expect(t.savingsCents).toBe(0);
    expect(t.savingsUnknownCount).toBe(1);
    expect(t.totalCents).toBe(unknown[0].o.priceCents);
  });

  it("never produces negative savings", () => {
    for (const x of withOffer) expect(collectionTotals([x.id]).savingsCents).toBeGreaterThanOrEqual(0);
  });

  it("counts and uses SPAR plus prices", () => {
    expect(plus.length).toBeGreaterThan(0);
    const t = collectionTotals([plus[0].id, plain[0].id]);
    expect(t.spPlusCount).toBe(1);
    expect(t.totalCents).toBe(plus[0].o.priceCents + plain[0].o.priceCents);
  });

  it("excludes per-kg offers from the total and counts them", () => {
    expect(perKg.length).toBeGreaterThan(0);
    const t = collectionTotals([perKg[0].id, plain[0].id]);
    expect(t.excludedPerKg).toBe(1);
    expect(t.pricedCount).toBe(1);
    expect(t.totalCents).toBe(plain[0].o.priceCents);
    expect(t.itemCount).toBe(2);
    const only = collectionTotals([perKg[0].id]);
    expect(only.totalCents).toBe(0);
    expect(only.savingsCents).toBe(0);
  });

  it("excludes non-current offers from both sums", () => {
    const a = known[0];
    state.nonCurrent.add(a.o.id);
    const other = plain.find((x) => x.id !== a.id)!;
    const t = collectionTotals([a.id, other.id]);
    expect(t.pricedCount).toBe(1);
    expect(t.totalCents).toBe(other.o.priceCents);
    expect(collectionTotals([a.id])).toMatchObject({ totalCents: 0, savingsCents: 0, pricedCount: 0, excludedPerKg: 0 });
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
