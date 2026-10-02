/**
 * Versioned localStorage persistence. Pure functions (no React) so they can be unit-tested.
 * Only IDs, settings and conversation text are stored — never images or secrets.
 */
import type { Conversation, SavedItem, SpPlusSetting } from "../types";

export const STORAGE_KEY = "sparko:v1";
export const STORAGE_VERSION = 1;

export type PersistedState = {
  v: typeof STORAGE_VERSION;
  saved: SavedItem[];
  /** User conversations only; demo conversations are static and never stored. */
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: { spPlus: SpPlusSetting; leafletHintSeen: boolean };
};

export function emptyState(): PersistedState {
  return { v: STORAGE_VERSION, saved: [], conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: false } };
}

export type LoadResult = { state: PersistedState; status: "ok" | "empty" | "recovered" | "unavailable" };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Sanitize an unknown parsed value into a valid PersistedState, dropping malformed entries. */
export function sanitize(input: unknown, knownProductIds?: Set<string>): PersistedState {
  const base = emptyState();
  if (!isObj(input)) return base;
  const seen = new Set<string>();
  const saved: SavedItem[] = [];
  if (Array.isArray(input.saved)) {
    for (const s of input.saved) {
      if (!isObj(s) || typeof s.productId !== "string" || typeof s.offerId !== "string") continue;
      if (knownProductIds && !knownProductIds.has(s.productId)) continue;
      if (seen.has(s.productId)) continue;
      seen.add(s.productId);
      saved.push({ productId: s.productId, offerId: s.offerId, savedAt: typeof s.savedAt === "number" ? s.savedAt : 0 });
    }
  }
  const conversations: Conversation[] = [];
  if (Array.isArray(input.conversations)) {
    for (const c of input.conversations) {
      if (!isObj(c) || typeof c.id !== "string" || !Array.isArray(c.messages)) continue;
      const messages = (c.messages as unknown[])
        .filter((m): m is Record<string, unknown> => isObj(m) && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
        // A request that was in flight when the page closed cannot complete; mark it recoverable.
        .map((m) => (m.status === "pending" ? { ...m, status: "error", text: m.text || "Odgovor je bil prekinjen." } : m)) as unknown as Conversation["messages"];
      conversations.push({
        id: c.id,
        kind: "user",
        title: typeof c.title === "string" ? c.title : "Pogovor",
        createdAt: typeof c.createdAt === "number" ? c.createdAt : 0,
        updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
        messages,
        ...(typeof c.forkedFrom === "string" ? { forkedFrom: c.forkedFrom } : {}),
      });
    }
  }
  const settings = isObj(input.settings) ? input.settings : {};
  const spPlus = settings.spPlus === "yes" || settings.spPlus === "no" ? settings.spPlus : "unset";
  return {
    v: STORAGE_VERSION,
    saved,
    conversations,
    activeConversationId: typeof input.activeConversationId === "string" ? input.activeConversationId : null,
    settings: { spPlus, leafletHintSeen: settings.leafletHintSeen === true },
  };
}

/** Migrate older payloads. v1 is the first version; unknown versions are sanitized best-effort. */
export function migrate(input: unknown, knownProductIds?: Set<string>): PersistedState {
  return sanitize(input, knownProductIds);
}

export function load(storage: Storage | null | undefined, knownProductIds?: Set<string>): LoadResult {
  if (!storage) return { state: emptyState(), status: "unavailable" };
  let rawText: string | null;
  try {
    rawText = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: emptyState(), status: "unavailable" };
  }
  if (!rawText) return { state: emptyState(), status: "empty" };
  try {
    const parsed = JSON.parse(rawText);
    return { state: migrate(parsed, knownProductIds), status: "ok" };
  } catch {
    // Corrupt payload: keep a backup copy for debugging, start clean.
    try {
      storage.setItem(`${STORAGE_KEY}:corrupt`, rawText.slice(0, 200_000));
    } catch {
      /* ignore */
    }
    return { state: emptyState(), status: "recovered" };
  }
}

export function save(storage: Storage | null | undefined, state: PersistedState): "ok" | "unavailable" | "quota" {
  if (!storage) return "unavailable";
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return "ok";
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ? "quota" : "unavailable";
  }
}
