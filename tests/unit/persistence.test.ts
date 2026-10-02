import { describe, expect, it } from "vitest";
import { emptyState, load, sanitize, save, STORAGE_KEY } from "@/lib/store/persistence";

class MemStorage implements Storage {
  map = new Map<string, string>();
  failWith: string | null = null;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWith) {
      const e = new Error("fail");
      e.name = this.failWith;
      throw e;
    }
    this.map.set(k, v);
  }
}

describe("persistence", () => {
  it("round-trips state", () => {
    const s = new MemStorage();
    const st = emptyState();
    st.saved.push({ productId: "sb-skuta-1kg", offerId: "offer-sb-skuta-1kg-4026", savedAt: 5 });
    st.settings.spPlus = "yes";
    expect(save(s, st)).toBe("ok");
    const { state, status } = load(s);
    expect(status).toBe("ok");
    expect(state.saved).toHaveLength(1);
    expect(state.settings.spPlus).toBe("yes");
  });

  it("returns empty for missing storage and missing key", () => {
    expect(load(null).status).toBe("unavailable");
    expect(load(new MemStorage()).status).toBe("empty");
  });

  it("recovers from corrupt JSON and keeps a backup", () => {
    const s = new MemStorage();
    s.setItem(STORAGE_KEY, "{not json");
    const r = load(s);
    expect(r.status).toBe("recovered");
    expect(r.state).toEqual(emptyState());
    expect(s.getItem(`${STORAGE_KEY}:corrupt`)).toBe("{not json");
  });

  it("deduplicates saved items and drops unknown products", () => {
    const st = sanitize(
      {
        v: 1,
        saved: [
          { productId: "a", offerId: "o-a", savedAt: 1 },
          { productId: "a", offerId: "o-a", savedAt: 2 },
          { productId: "ghost", offerId: "o-g", savedAt: 3 },
          { bad: true },
        ],
      },
      new Set(["a"]),
    );
    expect(st.saved.map((s) => s.productId)).toEqual(["a"]);
  });

  it("marks interrupted pending messages as recoverable errors", () => {
    const st = sanitize({
      conversations: [
        {
          id: "c1",
          title: "T",
          messages: [
            { id: "m1", role: "user", text: "Koliko stane skuta?", status: "ok" },
            { id: "m2", role: "assistant", text: "", status: "pending" },
          ],
        },
      ],
    });
    expect(st.conversations[0].messages[1].status).toBe("error");
    expect(st.conversations[0].kind).toBe("user");
  });

  it("migrates unknown/older shapes best-effort without throwing", () => {
    const st = sanitize({ v: 0, saved: "nope", conversations: [{ id: 1 }], settings: { spPlus: "maybe" } });
    expect(st.v).toBe(1);
    expect(st.saved).toEqual([]);
    expect(st.conversations).toEqual([]);
    expect(st.settings.spPlus).toBe("unset");
  });

  it("reports quota errors", () => {
    const s = new MemStorage();
    s.failWith = "QuotaExceededError";
    expect(save(s, emptyState())).toBe("quota");
    s.failWith = "SecurityError";
    expect(save(s, emptyState())).toBe("unavailable");
  });
});
