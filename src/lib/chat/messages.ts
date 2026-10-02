/**
 * Pure helpers for the Sparko chat client (no React, no store). Unit-testable.
 */
import { formatPrice, getOffer, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "../catalog";
import type { ChatAction, ChatRequest, ChatRequestMessage, ChatResponse, Message, MessageBlock, SpPlusSetting } from "../types";

export const MAX_INPUT_CHARS = 600;
export const HISTORY_LIMIT = 12;
export const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Message fields the chat UI keeps alongside the canonical Message type.
 * Persistence keeps unknown fields, so these survive a reload.
 * TODO(lead): consider adding `actions?: ChatAction[]` and `modeNotice?: string` to Message in types.ts.
 */
export type ChatMessage = Message & {
  /** Client actions from the response (only `open_leaflet` is rendered as a button). */
  actions?: ChatAction[];
  /** Short reason shown next to the fallback label, e.g. "Jezikovni model ni nastavljen." */
  modeNotice?: string;
};

export function asChatMessage(m: Message): ChatMessage {
  return m as ChatMessage;
}

/** "S-BUDGET Lahka skuta 10 % m. m., 1 kg: 3,38 €." */
export function productSummary(productId: string): string | null {
  const p = getProduct(productId);
  const o = getPrimaryOffer(productId);
  if (!p || !o) return null;
  const name = [p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null, p.name, p.descriptor].filter(Boolean).join(" ");
  const unit = PRICE_UNIT_LABEL[o.priceUnit];
  const cond = o.conditions.spPlusRequired ? " s kartico SPAR plus" : o.conditions.couponRequired ? " s kuponom" : "";
  return `${name}, ${p.packSize}: ${formatPrice(o.priceCents)}${unit ? " " + unit : ""}${cond}.`;
}

/** The deterministic user + assistant pair for a carousel product click (no network). */
export function productClickMessages(productId: string, makeId: (prefix: string) => string, now = Date.now()): [Message, Message] | null {
  const p = getProduct(productId);
  const o = getPrimaryOffer(productId);
  const summary = productSummary(productId);
  if (!p || !o || !summary) return null;
  return [
    { id: makeId("m"), role: "user", createdAt: now, text: `Pokaži: ${p.name}`, status: "ok", contextProductIds: [productId] },
    {
      id: makeId("m"),
      role: "assistant",
      createdAt: now + 1,
      text: summary,
      blocks: [{ type: "products", offerIds: [o.id], layout: "card" }],
      status: "ok",
      mode: "deterministic",
      contextProductIds: [productId],
    },
  ];
}

/**
 * History for the API: messages before (and including) the given user message,
 * skipping pending/errored placeholders, last HISTORY_LIMIT entries.
 */
export function buildRequest(
  conversationId: string,
  messages: Message[],
  uptoUserMessageId: string,
  savedProductIds: string[],
  spPlus: SpPlusSetting,
): ChatRequest {
  const idx = messages.findIndex((m) => m.id === uptoUserMessageId);
  const slice = idx >= 0 ? messages.slice(0, idx + 1) : messages;
  const history: ChatRequestMessage[] = slice
    .filter((m) => m.status === "ok" && m.text.trim().length > 0)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: m.role,
      text: m.text.slice(0, 2000),
      ...(m.contextProductIds?.length ? { contextProductIds: m.contextProductIds.slice(0, 8) } : {}),
    }));
  return { conversationId, messages: history, savedProductIds, spPlus };
}

/** Keep only well-formed blocks that reference known catalog data. */
export function sanitizeBlocks(blocks: unknown): MessageBlock[] {
  if (!Array.isArray(blocks)) return [];
  const out: MessageBlock[] = [];
  for (const b of blocks as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "products" && Array.isArray(b.offerIds)) {
      const offerIds = (b.offerIds as unknown[]).filter((id): id is string => typeof id === "string" && !!getOffer(id));
      if (offerIds.length) out.push({ ...(b as MessageBlock & { type: "products" }), offerIds });
    } else if (b.type === "recipe" && typeof b.recipeId === "string") {
      out.push({ type: "recipe", recipeId: b.recipeId });
    } else if (b.type === "choices" && Array.isArray(b.options)) {
      const options = (b.options as { label?: unknown; message?: unknown }[])
        .filter((o) => o && typeof o.label === "string" && typeof o.message === "string")
        .map((o) => ({ label: o.label as string, message: o.message as string }));
      if (options.length) out.push({ type: "choices", ...(typeof b.prompt === "string" ? { prompt: b.prompt } : {}), options });
    } else if (b.type === "notice" && typeof b.text === "string") {
      out.push({ type: "notice", tone: b.tone === "warning" ? "warning" : "info", text: b.text });
    }
  }
  return out;
}

export function isChatResponse(x: unknown): x is ChatResponse {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<ChatResponse>;
  return !!r.message && typeof r.message.text === "string" && (r.mode === "live" || r.mode === "fallback" || r.mode === "deterministic");
}

export function sanitizeActions(actions: unknown): ChatAction[] {
  if (!Array.isArray(actions)) return [];
  return (actions as Partial<ChatAction>[]).filter(
    (a): a is ChatAction => !!a && (a.type === "save" || a.type === "remove" || a.type === "open_leaflet") && typeof a.productId === "string" && !!getProduct(a.productId),
  );
}

/** Deterministic confirmation line based on the ACTUAL store result. */
export function saveResultLine(productId: string, result: "saved" | "already" | "unknown"): string {
  const name = getProduct(productId)?.name ?? "Izdelek";
  if (result === "saved") return `✓ ${name} je zdaj v tvojem Mojem katalogu.`;
  if (result === "already") return `${name} je že v tvojem Mojem katalogu.`;
  return `${name} ni bil dodan v Moj katalog, ker ga v demo katalogu ne najdem.`;
}

export function removeResultLine(productId: string, removed: boolean): string {
  const name = getProduct(productId)?.name ?? "Izdelek";
  return removed ? `${name} sem odstranil iz tvojega Mojega kataloga.` : `${name} ni v tvojem Mojem katalogu, zato ni bilo kaj odstraniti.`;
}

export type ChatFailure = "timeout" | "network" | "not_found" | "rate_limited" | "bad_request" | "server_error" | "invalid_response";

export function failureText(kind: ChatFailure, serverText?: string): string {
  switch (kind) {
    case "timeout":
      return "Odgovor je trajal predolgo. Poskusi znova.";
    case "network":
      return "Ni povezave s strežnikom. Preveri povezavo in poskusi znova.";
    case "rate_limited":
      return "Prejel sem preveč vprašanj naenkrat. Počakaj nekaj sekund in poskusi znova.";
    case "bad_request":
      return serverText && serverText.length < 200 ? serverText : "Tega sporočila nisem mogel obdelati. Poskusi ga zapisati drugače.";
    case "not_found":
    case "server_error":
    case "invalid_response":
    default:
      return "Sparko trenutno ne more odgovoriti. Poskusi znova čez trenutek.";
  }
}

export function statusToFailure(status: number, code?: string): ChatFailure {
  if (code === "rate_limited" || status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  if (code === "bad_request" || (status >= 400 && status < 500)) return "bad_request";
  return "server_error";
}

/** Display-only typography: keep prices/percentages and S-BUDGET from breaking across lines. */
export function displayText(text: string): string {
  return text.replace(/(\d) (?=[€%])/g, "$1\u00a0").replace(/S-BUDGET/g, "S\u2011BUDGET");
}

/** "Danes, 14:05" / "Včeraj" / "28. 9. 2026" */
export function relativeDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days <= 0) return `Danes, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (days === 1) return "Včeraj";
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** The composer's single trailing action: an inactive voice hint while empty, Send once there is text. */
export function composerAction(value: string): "mic" | "send" {
  return value.trim().length > 0 ? "send" : "mic";
}
