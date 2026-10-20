import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPrice, getOffer, getPlacements, getPrimaryOffer, products } from "@/lib/catalog";
import { buildRequest, composerAction, displayText, productClickMessages, relativeDate, sanitizeBlocks, saveResultLine } from "@/lib/chat/messages";
import { DEMO_CONVERSATIONS } from "@/lib/demo-conversations";
import { retryMessage, sendMessage, showProduct } from "@/lib/chat/useChat";
import { __resetForTests, createConversation, getConversation, getState, setActiveConversation } from "@/lib/store/store";
import type { Message } from "@/lib/types";

// Data-driven anchors (no ids of the old catalog): a product without a card price and another one for product clicks.
const ANCHOR = products.find((p) => p.line === "S-BUDGET")!;
const ANCHOR_ID = ANCHOR.id;
const ANCHOR_OFFER = getPrimaryOffer(ANCHOR_ID)!.id;
const OTHER_ID = products.find((p) => p.id !== ANCHOR_ID)!.id;

let n = 0;
const id = (p: string) => `${p}-${++n}`;

describe("chat message helpers", () => {
  it("builds a deterministic product click pair from catalog data", () => {
    const pair = productClickMessages(ANCHOR_ID, id, 1000);
    expect(pair).not.toBeNull();
    const [user, bot] = pair!;
    expect(user.text).toBe(`Pokaži: ${ANCHOR.name}`);
    expect(bot.mode).toBe("deterministic");
    expect(bot.text).toContain(formatPrice(getPrimaryOffer(ANCHOR_ID)!.priceCents));
    expect(bot.text).toContain(ANCHOR.packSize);
    expect(bot.blocks).toEqual([{ type: "products", offerIds: [ANCHOR_OFFER], layout: "card" }]);
    expect(bot.contextProductIds).toEqual([ANCHOR_ID]);
    expect(productClickMessages("does-not-exist", id)).toBeNull();
  });

  it("builds request history up to the user message, skipping errors and pending", () => {
    const msgs: Message[] = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", createdAt: i, text: `t${i}`, status: "ok" }));
    msgs[5] = { ...msgs[5], status: "error" };
    msgs.push({ id: "pending", role: "assistant", createdAt: 99, text: "", status: "pending" });
    const req = buildRequest("c1", msgs, "m18", [ANCHOR_ID], "yes");
    expect(req.messages.length).toBe(12);
    expect(req.messages.at(-1)).toEqual({ role: "user", text: "t18" });
    expect(req.messages.some((m) => m.text === "t5")).toBe(false);
    expect(req.savedProductIds).toEqual([ANCHOR_ID]);
    expect(req.spPlus).toBe("yes");
  });

  it("drops blocks with unknown offers", () => {
    const blocks = sanitizeBlocks([
      { type: "products", offerIds: [ANCHOR_OFFER, "fake"] },
      { type: "products", offerIds: ["fake"] },
      { type: "notice", tone: "danger", text: "x" },
      { type: "evil" },
    ]);
    expect(blocks).toEqual([
      { type: "products", offerIds: [ANCHOR_OFFER] },
      { type: "notice", tone: "info", text: "x" },
    ]);
  });

  it("keeps the location demo blocks and drops malformed ones", () => {
    expect(
      sanitizeBlocks([{ type: "nearest_store", extra: 1 }, { type: "store_map", sectionId: "pekarna" }, { type: "store_map", sectionId: 5 }]),
    ).toEqual([{ type: "nearest_store" }, { type: "store_map", sectionId: "pekarna" }]);
  });

  it("formats save results from the actual store result", () => {
    expect(saveResultLine(ANCHOR_ID, "saved")).toBe(`✓ ${ANCHOR.name} je zdaj v tvojem Mojem katalogu.`);
    expect(saveResultLine(ANCHOR_ID, "already")).toBe(`${ANCHOR.name} je že v tvojem Mojem katalogu.`);
    expect(saveResultLine(ANCHOR_ID, "unknown")).toMatch(/ni bil dodan/);
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
    expect(DEMO_CONVERSATIONS.map((c) => c.id)).toEqual(["demo-cena", "demo-sbudget", "demo-vecerja"]);
    for (const c of DEMO_CONVERSATIONS) {
      expect(c.kind).toBe("demo");
      expect(c.messages.length).toBeGreaterThanOrEqual(2);
    }
    // Data-driven: the price and page come from the skuta offer the demo itself points at.
    const skuta = DEMO_CONVERSATIONS[0];
    const block = skuta.messages[1].blocks?.[0];
    expect(block?.type).toBe("products");
    const offer = getOffer(block?.type === "products" ? block.offerIds[0] : "")!;
    expect(skuta.messages[1].text).toContain(formatPrice(offer.priceCents));
    expect(skuta.messages[3].text).toContain(`PDF-strani ${getPlacements(offer.id)[0].pdfPageNumber}`);
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
        message: { text: "Dodano.", blocks: [], contextProductIds: [ANCHOR_ID] },
        actions: [{ type: "save", productId: ANCHOR_ID }],
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
    expect(conv.messages[1].text).toContain(`✓ ${ANCHOR.name} je zdaj v tvojem Mojem katalogu.`);
    expect(getState().saved.map((s) => s.productId)).toEqual([ANCHOR_ID]);
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
    setActiveConversation("demo-cena");
    const before = DEMO_CONVERSATIONS[0].messages.length;
    sendMessage("Kaj pa cenejša možnost?");
    const cid = getState().activeConversationId!;
    expect(cid.startsWith("demo-")).toBe(false);
    const conv = getConversation(cid)!;
    expect(conv.forkedFrom).toBe("demo-cena");
    expect(conv.messages.length).toBe(before + 2);
    expect(DEMO_CONVERSATIONS[0].messages.length).toBe(before);
    expect(getState().saved).toEqual([]);
    await flush();
  });

  it("product click appends a verified card without network", () => {
    expect(showProduct(OTHER_ID)).toBe(true);
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
