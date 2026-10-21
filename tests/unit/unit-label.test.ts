import { describe, expect, it } from "vitest";
import { getPrimaryOffer, offers, products, unitLabel } from "@/lib/catalog";

describe("unitLabel (pack size + price unit shown together)", () => {
  it("drops the unit when the pack size already says it", () => {
    expect(unitLabel("1 kg", "kg")).toBe("");
    expect(unitLabel(" 1  KG ", "kg")).toBe("");
    expect(unitLabel("100 g", "100g")).toBe("");
    expect(unitLabel("1 kos", "kos")).toBe("");
  });
  it("keeps the unit when the pack size differs", () => {
    expect(unitLabel("750 g", "kg")).toBe("za kg");
    expect(unitLabel("500 g", "kg")).toBe("za kg");
    expect(unitLabel("250 g", "100g")).toBe("za 100 g");
    expect(unitLabel("6 kos", "kos")).toBe("za kos");
    expect(unitLabel("400 g", "pack")).toBe("");
  });
  it("never renders '1 kg · za kg' for any catalog product", () => {
    for (const p of products) {
      const o = getPrimaryOffer(p.id);
      if (!o) continue;
      const u = unitLabel(p.packSize, o.priceUnit);
      expect(`${p.packSize} · ${u}`).not.toMatch(/^1 kg · za kg$/);
    }
    expect(offers.some((o) => o.priceUnit === "kg")).toBe(true);
  });
});
