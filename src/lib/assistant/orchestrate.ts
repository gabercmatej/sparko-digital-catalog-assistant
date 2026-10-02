/**
 * Chat orchestration: validated input → intent/filters/context → retrieval → deterministic draft →
 * optional language model → validation → ChatResponse.
 *
 * Modes: "deterministic" (commands, clarifying questions, unknown products — no model by design),
 * "live" (model text passed validation), "fallback" (model disabled/unavailable/rejected; honest notice).
 */
import { getProduct } from "@/lib/catalog";
import { chatRequestSchema } from "@/lib/schemas";
import type { ChatErrorResponse, ChatRequest, ChatResponse } from "@/lib/types";
import { buildModelInput } from "./prompt";
import { ProviderError, type ChatProvider, type ProviderErrorKind } from "./provider";
import type { LiveQuotaResult } from "./ratelimit";
import { buildDeterministicReply, type ResponderDeps } from "./respond";
import { blocksForModelReply, validateModelOutput, type RejectReason } from "./validate";

export const NOTICES = {
  notConfigured: "Jezikovni model ni nastavljen, zato odgovarjam v omejenem načinu.",
  unavailable: "Jezikovni model trenutno ni na voljo, zato odgovarjam v omejenem načinu.",
  rejected: "Odgovor jezikovnega modela ni prestal preverjanja, zato odgovarjam v omejenem načinu.",
  quota: "Dosežena je omejitev pogovorov z jezikovnim modelom, zato odgovarjam v omejenem načinu.",
  disabled: "Jezikovni model v tej namestitvi ni vklopljen, zato odgovarjam v omejenem načinu.",
} as const;

export type FallbackCategory = ProviderErrorKind | "rejected" | "quota" | "disabled" | "no_provider";

export type OrchestratorDeps = ResponderDeps & {
  /** Null/undefined = no API key configured. */
  provider?: ChatProvider | null;
  /** Called only when the model would actually be used (lazy). Defaults to allowed. */
  liveQuota?: () => Promise<LiveQuotaResult>;
  /** Hard ceiling on the model call in addition to the SDK timeout. */
  timeoutMs?: number;
  /** Observability hook with non-sensitive categories only. */
  onEvent?: (e: { type: "fallback"; category: FallbackCategory; reason?: RejectReason } | { type: "live" }) => void;
};

export type HandleResult = { status: 200; body: ChatResponse } | { status: 400; body: ChatErrorResponse };

export const BAD_REQUEST_TEXT = "Sporočila ni bilo mogoče obdelati. Preveri, da ni prazno ali predolgo (največ 600 znakov).";

/** Drop unknown/untrusted ids sent by the client. */
function sanitizeRequest(req: ChatRequest): ChatRequest {
  return {
    ...req,
    savedProductIds: req.savedProductIds.filter((id) => !!getProduct(id)),
    messages: req.messages.map((m) => ({
      role: m.role,
      text: m.text,
      ...(m.contextProductIds ? { contextProductIds: m.contextProductIds.filter((id) => !!getProduct(id)) } : {}),
    })),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ProviderError("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function handleChat(input: unknown, deps: OrchestratorDeps = {}): Promise<HandleResult> {
  // Guard: the shared schema's .refine() reads m[m.length - 1] and throws on an empty array in zod 4
  // (refinements still run after .min(1) fails), so treat any throw as a bad request.
  let parsed: ReturnType<typeof chatRequestSchema.safeParse>;
  try {
    parsed = chatRequestSchema.safeParse(input);
  } catch {
    return { status: 400, body: { error: BAD_REQUEST_TEXT, code: "bad_request" } };
  }
  if (!parsed.success) return { status: 400, body: { error: BAD_REQUEST_TEXT, code: "bad_request" } };
  const req = sanitizeRequest(parsed.data);
  const draft = buildDeterministicReply(req, deps);

  const base: ChatResponse = {
    conversationId: req.conversationId,
    message: { text: draft.text, blocks: draft.blocks, contextProductIds: draft.contextProductIds },
    actions: draft.actions,
    mode: "deterministic",
  };
  if (!draft.allowModel) return { status: 200, body: base };

  const fallback = (category: FallbackCategory, notice: string, reason?: RejectReason): HandleResult => {
    deps.onEvent?.({ type: "fallback", category, ...(reason ? { reason } : {}) });
    return { status: 200, body: { ...base, mode: "fallback", notice } };
  };

  if (!deps.provider) return fallback("no_provider", NOTICES.notConfigured);

  if (deps.liveQuota) {
    let q: LiveQuotaResult;
    try {
      q = await deps.liveQuota();
    } catch {
      q = { allowed: false, reason: "limiter_error" };
    }
    if (!q.allowed) {
      if (q.reason === "quota_exceeded") return fallback("quota", NOTICES.quota);
      if (q.reason === "limiter_not_configured") return fallback("disabled", NOTICES.disabled);
      return fallback("api", NOTICES.unavailable);
    }
  }

  let raw: unknown;
  try {
    raw = await withTimeout(deps.provider.generate(buildModelInput(req, draft)), deps.timeoutMs ?? 13_000);
  } catch (err) {
    const kind: ProviderErrorKind = err instanceof ProviderError ? err.kind : "api";
    if (kind === "not_configured") return fallback(kind, NOTICES.notConfigured);
    if (kind === "malformed" || kind === "refusal") return fallback(kind, NOTICES.rejected);
    return fallback(kind, NOTICES.unavailable);
  }

  const v = validateModelOutput(raw, draft);
  if (!v.ok) return fallback(v.reason === "schema" ? "malformed" : "rejected", NOTICES.rejected, v.reason);

  const { blocks, contextProductIds } = blocksForModelReply(draft, v);
  deps.onEvent?.({ type: "live" });
  return {
    status: 200,
    body: { ...base, message: { text: v.text, blocks, contextProductIds }, mode: "live" },
  };
}
