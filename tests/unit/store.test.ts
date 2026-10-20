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
import { getPrimaryOffer, products } from "@/lib/catalog";
import type { Conversation } from "@/lib/types";

const A = products[0].id;
const B = products[1].id;

describe("store", () => {
  beforeEach(() => __resetForTests());

  it("saves idempotently and rejects unknown ids", () => {
    expect(saveProduct(A, { toast: false })).toBe("saved");
    expect(saveProduct(A, { toast: false })).toBe("already");
    expect(saveProduct("does-not-exist", { toast: false })).toBe("unknown");
    expect(getState().saved).toHaveLength(1);
    expect(getState().saved[0].offerId).toBe(getPrimaryOffer(A)!.id);
  });

  it("emits a highlight event only on real saves", () => {
    saveProduct(A, { toast: false });
    const first = getState().highlight;
    expect(first?.productId).toBe(A);
    saveProduct(A, { toast: false });
    expect(getState().highlight).toBe(first);
  });

  it("removes and resets selection without touching conversations", () => {
    const id = createConversation();
    appendMessage(id, { id: "m1", role: "user", text: "Koliko stane izdelek?", createdAt: 1, status: "ok" });
    saveProduct(A, { toast: false });
    saveProduct(B, { toast: false });
    expect(removeProduct(B, { toast: false })).toBe(true);
    expect(removeProduct(B, { toast: false })).toBe(false);
    resetSelection();
    expect(getState().saved).toHaveLength(0);
    expect(getState().conversations).toHaveLength(1);
    expect(getState().conversations[0].title).toBe("Koliko stane izdelek?");
  });

  it("deleting conversations keeps the selection", () => {
    saveProduct(A, { toast: false });
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
