"use client";
/**
 * Chat orchestration: sending, retry, product clicks, response actions.
 * In-flight requests are tracked per conversation id (module level), and a response
 * always updates ITS conversation's placeholder by id — even if the user switched chats.
 */
import { useMemo } from "react";
import { getDemoConversation, isDemoId } from "../demo-conversations";
import {
  appendMessage,
  createConversation,
  forkConversation,
  getConversation,
  getState,
  newId,
  removeProduct,
  saveProduct,
  updateMessage,
  useStore,
} from "../store/store";
import type { Conversation, Message } from "../types";
import {
  buildRequest,
  failureText,
  isChatResponse,
  MAX_INPUT_CHARS,
  productClickMessages,
  removeResultLine,
  REQUEST_TIMEOUT_MS,
  sanitizeActions,
  sanitizeBlocks,
  saveResultLine,
  statusToFailure,
  type ChatFailure,
  type ChatMessage,
} from "./messages";

const inFlight = new Map<string, AbortController>();

export function isRequestInFlight(conversationId: string | null | undefined): boolean {
  return !!conversationId && inFlight.has(conversationId);
}

/** Resolve the active conversation (user or demo). */
export function resolveConversation(id: string | null, conversations: Conversation[]): Conversation | undefined {
  if (!id) return undefined;
  return isDemoId(id) ? getDemoConversation(id) : conversations.find((c) => c.id === id);
}

/** Returns a writable user conversation id: creates one, or forks the active demo. */
function ensureWritableConversation(): string {
  const { activeConversationId } = getState();
  if (activeConversationId && isDemoId(activeConversationId)) {
    const demo = getDemoConversation(activeConversationId);
    return demo ? forkConversation(demo) : createConversation();
  }
  if (activeConversationId && getConversation(activeConversationId)) return activeConversationId;
  return createConversation();
}

async function request(conversationId: string, placeholderId: string, userMessageId: string) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  const s = getState();
  const body = buildRequest(
    conversationId,
    conv.messages,
    userMessageId,
    s.saved.map((i) => i.productId),
    s.settings.spPlus,
  );

  const controller = new AbortController();
  inFlight.set(conversationId, controller);
  const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);

  const fail = (kind: ChatFailure, serverText?: string) => {
    updateMessage(conversationId, placeholderId, { status: "error", text: failureText(kind, serverText), retryOf: userMessageId });
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json ?? {}) as { error?: unknown; code?: string };
      fail(statusToFailure(res.status, err.code), typeof err.error === "string" ? err.error : undefined);
      return;
    }
    if (!isChatResponse(json)) {
      fail("invalid_response");
      return;
    }
    const blocks = sanitizeBlocks(json.message.blocks);
    const actions = sanitizeActions(json.actions);
    // Apply state actions through the store and report the ACTUAL result.
    const lines: string[] = [];
    for (const a of actions) {
      if (a.type === "save") lines.push(saveResultLine(a.productId, saveProduct(a.productId)));
      else if (a.type === "remove") lines.push(removeResultLine(a.productId, removeProduct(a.productId)));
    }
    const text = [json.message.text.trim(), ...lines].filter(Boolean).join("\n\n");
    const patch: Partial<ChatMessage> = {
      status: "ok",
      text,
      blocks,
      mode: json.mode,
      contextProductIds: Array.isArray(json.message.contextProductIds) ? json.message.contextProductIds.filter((x) => typeof x === "string") : [],
      retryOf: undefined,
      actions: actions.filter((a) => a.type === "open_leaflet"),
      modeNotice: typeof json.notice === "string" ? json.notice : undefined,
    };
    updateMessage(conversationId, placeholderId, patch as Partial<Message>);
  } catch {
    fail(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    if (inFlight.get(conversationId) === controller) inFlight.delete(conversationId);
  }
}

/** Send a new user message. Returns false when ignored (empty, too long or a request is pending). */
export function sendMessage(rawText: string): boolean {
  const text = rawText.trim().slice(0, MAX_INPUT_CHARS);
  if (!text) return false;
  const active = getState().activeConversationId;
  if (active && !isDemoId(active) && inFlight.has(active)) return false;
  const conversationId = ensureWritableConversation();
  if (inFlight.has(conversationId)) return false;
  const now = Date.now();
  const user: Message = { id: newId("m"), role: "user", createdAt: now, text, status: "ok" };
  const placeholder: Message = { id: newId("m"), role: "assistant", createdAt: now + 1, text: "", status: "pending", retryOf: user.id };
  appendMessage(conversationId, user);
  appendMessage(conversationId, placeholder);
  void request(conversationId, placeholder.id, user.id);
  return true;
}

/** Retry an errored assistant message in place (the user message is not duplicated). */
export function retryMessage(conversationId: string, assistantMessageId: string): boolean {
  if (inFlight.has(conversationId)) return false;
  const conv = getConversation(conversationId);
  const msg = conv?.messages.find((m) => m.id === assistantMessageId);
  if (!conv || !msg || msg.status !== "error") return false;
  const userId = msg.retryOf ?? [...conv.messages.slice(0, conv.messages.indexOf(msg))].reverse().find((m) => m.role === "user")?.id;
  if (!userId) return false;
  updateMessage(conversationId, assistantMessageId, { status: "pending", text: "", retryOf: userId });
  void request(conversationId, assistantMessageId, userId);
  return true;
}

/** Carousel / tile click: immediate verified product card, no network. */
export function showProduct(productId: string): boolean {
  const pair = productClickMessages(productId, newId);
  if (!pair) return false;
  const conversationId = ensureWritableConversation();
  appendMessage(conversationId, pair[0]);
  appendMessage(conversationId, pair[1]);
  return true;
}

export function useChat() {
  const store = useStore();
  const conversation = resolveConversation(store.activeConversationId, store.conversations);
  const pending = !!conversation && conversation.messages.some((m) => m.status === "pending");
  return useMemo(
    () => ({
      hydrated: store.hydrated,
      conversation,
      isDemo: conversation?.kind === "demo",
      pending,
      send: sendMessage,
      retry: (messageId: string) => (conversation ? retryMessage(conversation.id, messageId) : false),
      showProduct,
    }),
    [store.hydrated, conversation, pending],
  );
}
