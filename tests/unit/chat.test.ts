import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, composerAction, displayText, productClickMessages, relativeDate, sanitizeBlocks, saveResultLine } from "@/lib/chat/messages";
import { DEMO_CONVERSATIONS } from "@/lib/demo-conversations";
import { retryMessage, sendMessage, showProduct } from "@/lib/chat/useChat";
import { __resetForTests, createConversation, getConversation, getState, setActiveConversation } from "@/lib/store/store";
import type { Message } from "@/lib/types";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

describe("chat message helpers", () => {
  it("builds a deterministic product click pair from catalog data", () => {
    const pair = productClickMessages("sb-skuta-1kg", id, 1000);
    expect(pair).not.toBeNull();
    const [user, bot] = pair!;
    expect(user.text).toBe("Pokaži: Lahka skuta");
    expect(bot.mode).toBe("deterministic");
    expect(bot.text).toContain("3,38 €");
    expect(bot.text).toContain("1 kg");
    expect(bot.blocks).toEqual([{ type: "products", offerIds: ["offer-sb-skuta-1kg-4026"], layout: "card" }]);
    expect(bot.contextProductIds).toEqual(["sb-skuta-1kg"]);
    expect(productClickMessages("does-not-exist", id)).toBeNull();
  });

  it("builds request history up to the user message, skipping errors and pending", () => {
    const msgs: Message[] = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", createdAt: i, text: `t${i}`, status: "ok" }));
    msgs[5] = { ...msgs[5], status: "error" };
    msgs.push({ id: "pending", role: "assistant", createdAt: 99, text: "", status: "pending" });
    const req = buildRequest("c1", msgs, "m18", ["sb-skuta-1kg"], "yes");
    expect(req.messages.length).toBe(12);
    expect(req.messages.at(-1)).toEqual({ role: "user", text: "t18" });
    expect(req.messages.some((m) => m.text === "t5")).toBe(false);
    expect(req.savedProductIds).toEqual(["sb-skuta-1kg"]);
    expect(req.spPlus).toBe("yes");
  });

  it("drops blocks with unknown offers", () => {
    const blocks = sanitizeBlocks([
      { type: "products", offerIds: ["offer-sb-skuta-1kg-4026", "fake"] },
      { type: "products", offerIds: ["fake"] },
      { type: "notice", tone: "danger", text: "x" },
      { type: "evil" },
    ]);
    expect(blocks).toEqual([
      { type: "products", offerIds: ["offer-sb-skuta-1kg-4026"] },
      { type: "notice", tone: "info", text: "x" },
    ]);
  });

  it("formats save results from the actual store result", () => {
    expect(saveResultLine("sb-skuta-1kg", "saved")).toBe("✓ Lahka skuta je zdaj v tvojem Mojem katalogu.");
    expect(saveResultLine("sb-skuta-1kg", "already")).toBe("Lahka skuta je že v tvojem Mojem katalogu.");
    expect(saveResultLine("sb-skuta-1kg", "unknown")).toMatch(/ni bil dodan/);
  });

  it("keeps prices together for display", () => {
    expect(displayText("3,38 € in 20 %")).toBe("3,38 € in 20 %");
  });

  it("formats relative dates", () => {
    const now = new Date(2026, 9, 2, 15, 0).getTime();
    expect(relativeDate(new Date(2026, 9, 2, 9, 5).getTime(), now)).toBe("Danes, 09:05");
    expect(relativeDate(new Date(2026, 9, 1, 9, 5).getTime(), now)).toBe("Včeraj");
    expect(relativeDate(new Date(2026, 8, 28).getTime(), now)).toBe("28. 9. 2026");
  });
});

describe("demo conversations", () => {
  it("are three static demos computed from catalog data", () => {
    expect(DEMO_CONVERSATIONS.map((c) => c.id)).toEqual(["demo-skuta", "demo-sbudget", "demo-vecerja"]);
    for (const c of DEMO_CONVERSATIONS) {
      expect(c.kind).toBe("demo");
      expect(c.messages.length).toBeGreaterThanOrEqual(2);
    }
    const skuta = DEMO_CONVERSATIONS[0];
    expect(skuta.messages[1].text).toContain("3,38 €");
    expect(skuta.messages[3].text).toContain("PDF-strani 5");
  });
});

describe("chat flow (send / retry / product click)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("marks an error without duplicating the user message on retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    expect(sendMessage("Koliko stane skuta?")).toBe(true);
    const cid = getState().activeConversationId!;
    // Double send while pending is ignored.
    expect(sendMessage("Še enkrat")).toBe(false);
    await flush();
    await flush();
    let conv = getConversation(cid)!;
    expect(conv.messages.map((m) => [m.role, m.status])).toEqual([
      ["user", "ok"],
      ["assistant", "error"],
    ]);
    const err = conv.messages[1];
    expect(err.retryOf).toBe(conv.messages[0].id);

    fetchMock.mockResolvedValueOnce(
      Response.json({
        conversationId: cid,
        message: { text: "Dodano.", blocks: [], contextProductIds: ["sb-skuta-1kg"] },
        actions: [{ type: "save", productId: "sb-skuta-1kg" }],
        mode: "fallback",
      }),
    );
    expect(retryMessage(cid, err.id)).toBe(true);
    await flush();
    await flush();
    conv = getConversation(cid)!;
    expect(conv.messages.length).toBe(2);
    expect(conv.messages[1].status).toBe("ok");
    expect(conv.messages[1].mode).toBe("fallback");
    expect(conv.messages[1].text).toContain("✓ Lahka skuta je zdaj v tvojem Mojem katalogu.");
    expect(getState().saved.map((s) => s.productId)).toEqual(["sb-skuta-1kg"]);
  });

  it("delivers a late response into its own conversation after switching chats", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    sendMessage("Kaj je najbolj znižano?");
    const first = getState().activeConversationId!;
    const other = createConversation();
    setActiveConversation(other);
    resolve(Response.json({ conversationId: first, message: { text: "Odgovor", blocks: [], contextProductIds: [] }, actions: [], mode: "live" }));
    await flush();
    await flush();
    expect(getConversation(first)!.messages[1]).toMatchObject({ text: "Odgovor", status: "ok" });
    expect(getConversation(other)!.messages).toEqual([]);
  });

  it("forks a demo when sending from it and leaves the demo intact", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    setActiveConversation("demo-skuta");
    const before = DEMO_CONVERSATIONS[0].messages.length;
    sendMessage("Kaj pa cenejša možnost?");
    const cid = getState().activeConversationId!;
    expect(cid.startsWith("demo-")).toBe(false);
    const conv = getConversation(cid)!;
    expect(conv.forkedFrom).toBe("demo-skuta");
    expect(conv.messages.length).toBe(before + 2);
    expect(DEMO_CONVERSATIONS[0].messages.length).toBe(before);
    expect(getState().saved).toEqual([]);
    await flush();
  });

  it("product click appends a verified card without network", () => {
    expect(showProduct("sb-pommes-1kg")).toBe(true);
    const conv = getConversation(getState().activeConversationId!)!;
    expect(conv.messages[1].blocks?.[0]).toMatchObject({ type: "products" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("composer action (single mic/send button)", () => {
  it("empty or whitespace input shows the inactive microphone; text turns it into send", () => {
    expect(composerAction("")).toBe("mic");
    expect(composerAction("   \n ")).toBe("mic");
    expect(composerAction("skuta")).toBe("send");
  });
});
