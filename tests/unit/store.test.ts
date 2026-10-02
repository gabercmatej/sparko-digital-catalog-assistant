import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTests,
  appendMessage,
  createConversation,
  deleteUserConversations,
  forkConversation,
  getState,
  removeProduct,
  resetSelection,
  saveProduct,
} from "@/lib/store/store";
import type { Conversation } from "@/lib/types";

describe("store", () => {
  beforeEach(() => __resetForTests());

  it("saves idempotently and rejects unknown ids", () => {
    expect(saveProduct("sb-skuta-1kg", { toast: false })).toBe("saved");
    expect(saveProduct("sb-skuta-1kg", { toast: false })).toBe("already");
    expect(saveProduct("does-not-exist", { toast: false })).toBe("unknown");
    expect(getState().saved).toHaveLength(1);
    expect(getState().saved[0].offerId).toBe("offer-sb-skuta-1kg-4026");
  });

  it("emits a highlight event only on real saves", () => {
    saveProduct("sb-skuta-1kg", { toast: false });
    const first = getState().highlight;
    expect(first?.productId).toBe("sb-skuta-1kg");
    saveProduct("sb-skuta-1kg", { toast: false });
    expect(getState().highlight).toBe(first);
  });

  it("removes and resets selection without touching conversations", () => {
    const id = createConversation();
    appendMessage(id, { id: "m1", role: "user", text: "Koliko stane skuta?", createdAt: 1, status: "ok" });
    saveProduct("sb-skuta-1kg", { toast: false });
    saveProduct("sb-pommes-1kg", { toast: false });
    expect(removeProduct("sb-pommes-1kg", { toast: false })).toBe(true);
    expect(removeProduct("sb-pommes-1kg", { toast: false })).toBe(false);
    resetSelection();
    expect(getState().saved).toHaveLength(0);
    expect(getState().conversations).toHaveLength(1);
    expect(getState().conversations[0].title).toBe("Koliko stane skuta?");
  });

  it("deleting conversations keeps the selection", () => {
    saveProduct("sb-skuta-1kg", { toast: false });
    createConversation();
    deleteUserConversations();
    expect(getState().conversations).toHaveLength(0);
    expect(getState().saved).toHaveLength(1);
  });

  it("forking a demo creates a user copy and leaves the demo untouched", () => {
    const demo: Conversation = {
      id: "demo-x",
      kind: "demo",
      title: "Primer",
      createdAt: 0,
      updatedAt: 0,
      messages: [{ id: "d1", role: "user", text: "Hi", createdAt: 0, status: "ok" }],
    };
    const id = forkConversation(demo);
    appendMessage(id, { id: "m2", role: "user", text: "Naprej", createdAt: 1, status: "ok" });
    const fork = getState().conversations.find((c) => c.id === id)!;
    expect(fork.kind).toBe("user");
    expect(fork.forkedFrom).toBe("demo-x");
    expect(fork.messages).toHaveLength(2);
    expect(demo.messages).toHaveLength(1);
    expect(getState().saved).toHaveLength(0);
  });
});
