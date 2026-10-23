import { describe, expect, it } from "vitest";
import { getStats, getVisitHistory, recordActivity } from "@/lib/auth/analytics";
import { makeStore } from "./auth-helpers";

describe("visit counting", () => {
  it("many calls within 30 minutes count as one visit", async () => {
    const { store } = makeStore();
    const first = await recordActivity(store, "r_1", { now: 1000 });
    const rest = await Promise.all(Array.from({ length: 20 }, (_, i) => recordActivity(store, "r_1", { now: 2000 + i })));
    expect(first).toBe(true);
    expect(rest.some(Boolean)).toBe(false);
    expect((await getStats(store, ["r_1"])).r_1.visits).toBe(1);
  });

  it("after the activity marker expires a new visit starts", async () => {
    const { store, redis } = makeStore();
    await recordActivity(store, "r_1", { now: 1000 });
    redis.expireNow(store.key("active", "r_1"));
    expect(await recordActivity(store, "r_1", { now: 9000 })).toBe(true);
    expect((await getStats(store, ["r_1"])).r_1.visits).toBe(2);
  });

  it("activity refreshes the 30-minute marker (sliding window)", async () => {
    const { store, redis } = makeStore();
    await recordActivity(store, "r_1");
    const ttl = redis.ttl(store.key("active", "r_1"));
    expect(ttl).toBeGreaterThan(1700);
    expect(ttl).toBeLessThanOrEqual(1800);
  });

  it("concurrent calls on a fresh marker count exactly one visit", async () => {
    const { store } = makeStore();
    const res = await Promise.all(Array.from({ length: 12 }, () => recordActivity(store, "r_1")));
    expect(res.filter(Boolean)).toHaveLength(1);
    const stats = (await getStats(store, ["r_1"])).r_1;
    expect(stats.visits).toBe(1);
    expect((await getVisitHistory(store, "r_1")).length).toBe(1);
  });

  it("pageViews increment only with pageView: true", async () => {
    const { store } = makeStore();
    await recordActivity(store, "r_1");
    await recordActivity(store, "r_1");
    await recordActivity(store, "r_1", { pageView: true });
    await recordActivity(store, "r_1", { pageView: true });
    await recordActivity(store, "r_1", { pageView: false });
    expect((await getStats(store, ["r_1"])).r_1.pageViews).toBe(2);
  });

  it("history is newest first", async () => {
    const { store, redis } = makeStore();
    for (const t of [1000, 2000, 3000]) {
      await recordActivity(store, "r_1", { now: t });
      redis.expireNow(store.key("active", "r_1"));
    }
    expect(await getVisitHistory(store, "r_1")).toEqual([3000, 2000, 1000]);
    expect(await getVisitHistory(store, "r_1", 2)).toEqual([3000, 2000]);
    expect(await getVisitHistory(store, "nobody")).toEqual([]);
  });

  it("stats are stored per account (no cross-account bleed) and lastSeen is tracked", async () => {
    const { store } = makeStore();
    await recordActivity(store, "r_1", { now: 5000, pageView: true });
    await recordActivity(store, "r_2", { now: 7000 });
    await recordActivity(store, "r_2", { now: 8000, pageView: true });
    const stats = await getStats(store, ["r_1", "r_2", "r_3"]);
    expect(stats.r_1).toEqual({ visits: 1, pageViews: 1, lastSeen: 5000 });
    expect(stats.r_2).toEqual({ visits: 1, pageViews: 1, lastSeen: 8000 });
    expect(stats.r_3).toEqual({ visits: 0, pageViews: 0, lastSeen: null });
    expect(await getStats(store, [])).toEqual({});
  });
});
