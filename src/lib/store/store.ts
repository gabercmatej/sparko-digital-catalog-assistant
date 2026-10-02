"use client";
/**
 * The single client-side store for saved products, conversations and settings.
 * All views (chat cards, carousel, Moj katalog, leaflet) read and mutate through here,
 * so saved state is always consistent. Persisted to versioned localStorage.
 */
import { useSyncExternalStore } from "react";
import { getPrimaryOffer, getProduct, products } from "../catalog";
import type { Conversation, Message, SpPlusSetting } from "../types";
import { emptyState, load, save, STORAGE_KEY, type PersistedState } from "./persistence";

export type Toast = {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
};

/** Fired once per real save/navigation so the leaflet can pulse exactly once. */
export type HighlightEvent = { productId: string; nonce: number; reason: "saved" | "navigate" };

export type StoreState = PersistedState & {
  hydrated: boolean;
  storageStatus: "ok" | "unavailable" | "quota" | "recovered";
  toasts: Toast[];
  highlight: HighlightEvent | null;
};

const knownIds = new Set(products.map((p) => p.id));

let state: StoreState = { ...emptyState(), hydrated: false, storageStatus: "ok", toasts: [], highlight: null };
const listeners = new Set<() => void>();
const serverSnapshot: StoreState = state;

function emit() {
  for (const l of listeners) l();
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function persist() {
  const { v, saved, conversations, activeConversationId, settings } = state;
  const result = save(storage(), { v, saved, conversations, activeConversationId, settings });
  if (result !== "ok" && state.storageStatus !== result) {
    state = { ...state, storageStatus: result };
  } else if (result === "ok" && state.storageStatus !== "ok" && state.storageStatus !== "recovered") {
    state = { ...state, storageStatus: "ok" };
  }
}

function set(patch: Partial<StoreState>, opts: { persist?: boolean } = { persist: true }) {
  state = { ...state, ...patch };
  if (opts.persist !== false && state.hydrated) persist();
  emit();
}

export function newId(prefix: string): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rnd}`;
}

// ---------------------------------------------------------------- hydration

export function hydrate() {
  if (state.hydrated) return;
  const { state: loaded, status } = load(storage(), knownIds);
  state = {
    ...state,
    ...loaded,
    hydrated: true,
    storageStatus: status === "unavailable" ? "unavailable" : status === "recovered" ? "recovered" : "ok",
  };
  emit();
  if (typeof window !== "undefined") {
    // Keep multiple tabs on the same origin in sync.
    window.addEventListener("storage", (e) => {
      if (e.key !== STORAGE_KEY) return;
      const { state: fresh } = load(storage(), knownIds);
      state = { ...state, ...fresh };
      emit();
    });
  }
}

// ---------------------------------------------------------------- toasts

export function showToast(text: string, action?: Toast["action"], ttlMs = 5000) {
  const id = newId("t");
  set({ toasts: [...state.toasts.slice(-2), { id, text, action }] }, { persist: false });
  if (typeof window !== "undefined") window.setTimeout(() => dismissToast(id), ttlMs);
  return id;
}
export function dismissToast(id: string) {
  if (!state.toasts.some((t) => t.id === id)) return;
  set({ toasts: state.toasts.filter((t) => t.id !== id) }, { persist: false });
}

// ---------------------------------------------------------------- saved products

export function isSaved(productId: string, s: StoreState = state): boolean {
  return s.saved.some((i) => i.productId === productId);
}

/**
 * Idempotent save. Returns "saved" on a real mutation, "already" if present, "unknown" for invalid IDs.
 * Only call after a real user click or explicit command.
 */
export function saveProduct(productId: string, opts: { toast?: boolean; savedAt?: number } = {}): "saved" | "already" | "unknown" {
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return "unknown";
  if (isSaved(productId)) return "already";
  const item = { productId, offerId: offer.id, savedAt: opts.savedAt ?? Date.now() };
  set({ saved: [...state.saved, item], highlight: { productId, nonce: Date.now(), reason: "saved" } });
  if (opts.toast !== false) {
    showToast(`${product.name} je v Mojem katalogu.`, { label: "Razveljavi", run: () => removeProduct(productId, { toast: false }) });
  }
  return "saved";
}

export function removeProduct(productId: string, opts: { toast?: boolean } = {}): boolean {
  const item = state.saved.find((i) => i.productId === productId);
  if (!item) return false;
  set({ saved: state.saved.filter((i) => i.productId !== productId) });
  const product = getProduct(productId);
  if (opts.toast !== false && product) {
    showToast(`${product.name} odstranjen iz Mojega kataloga.`, {
      label: "Razveljavi",
      run: () => saveProduct(productId, { toast: false, savedAt: item.savedAt }),
    });
  }
  return true;
}

export function toggleProduct(productId: string) {
  return isSaved(productId) ? removeProduct(productId) : saveProduct(productId);
}

/** Request a one-time leaflet pulse for a product (e.g. after "Poglej v SPAR katalogu"). */
export function requestHighlight(productId: string) {
  set({ highlight: { productId, nonce: Date.now(), reason: "navigate" } }, { persist: false });
}

/** Clears the demo selection (saved products) only. Conversations are untouched. */
export function resetSelection() {
  set({ saved: [] });
}

// ---------------------------------------------------------------- conversations

export function createConversation(title = "Nov pogovor", messages: Message[] = [], forkedFrom?: string): string {
  const now = Date.now();
  const conv: Conversation = { id: newId("c"), kind: "user", title, createdAt: now, updatedAt: now, messages, ...(forkedFrom ? { forkedFrom } : {}) };
  set({ conversations: [conv, ...state.conversations], activeConversationId: conv.id });
  return conv.id;
}

/** Copy a demo (or any) conversation into a new user conversation; the original is untouched. */
export function forkConversation(source: Conversation): string {
  const copy = source.messages.map((m) => ({ ...m, id: newId("m") }));
  return createConversation(source.title, copy, source.id);
}

/** Start a fresh chat. Saved products are preserved. Empty user conversations are reused. */
export function startNewChat() {
  set({ activeConversationId: null });
}

export function setActiveConversation(id: string | null) {
  set({ activeConversationId: id });
}

export function getConversation(id: string): Conversation | undefined {
  return state.conversations.find((c) => c.id === id);
}

function updateConversation(id: string, fn: (c: Conversation) => Conversation) {
  let changed = false;
  const conversations = state.conversations.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  if (changed) set({ conversations });
  return changed;
}

export function appendMessage(conversationId: string, message: Message): boolean {
  return updateConversation(conversationId, (c) => {
    const isFirstUser = message.role === "user" && !c.messages.some((m) => m.role === "user") && !c.forkedFrom;
    return {
      ...c,
      title: isFirstUser ? titleFrom(message.text) : c.title,
      messages: [...c.messages, message],
      updatedAt: Date.now(),
    };
  });
}

export function updateMessage(conversationId: string, messageId: string, patch: Partial<Message>): boolean {
  return updateConversation(conversationId, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    updatedAt: Date.now(),
  }));
}

export function removeMessage(conversationId: string, messageId: string): boolean {
  return updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== messageId) }));
}

export function deleteConversation(id: string) {
  set({
    conversations: state.conversations.filter((c) => c.id !== id),
    activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
  });
}

/** Deletes the tester's own conversations only. Saved products are untouched. */
export function deleteUserConversations() {
  set({ conversations: [], activeConversationId: null });
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 46)}…` : t || "Nov pogovor";
}

// ---------------------------------------------------------------- settings

export function setSpPlus(value: SpPlusSetting) {
  set({ settings: { ...state.settings, spPlus: value } });
}
export function markLeafletHintSeen() {
  if (state.settings.leafletHintSeen) return;
  set({ settings: { ...state.settings, leafletHintSeen: true } });
}

// ---------------------------------------------------------------- React binding

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getState(): StoreState {
  return state;
}

/** Subscribe to the whole store (re-renders on any change). Select inside the component. */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState, () => serverSnapshot);
}

/** Test helper: reset module state. */
export function __resetForTests() {
  state = { ...emptyState(), hydrated: true, storageStatus: "ok", toasts: [], highlight: null };
  emit();
}
