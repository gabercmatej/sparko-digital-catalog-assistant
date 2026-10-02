/**
 * Validation of language-model output. The model may only phrase text and choose which candidate
 * products to show. Anything numeric must come from placeholders resolved from verified data.
 * On any violation the caller falls back to the deterministic reply.
 */
import { z } from "zod";
import { getPrimaryOffer } from "@/lib/catalog";
import type { MessageBlock } from "@/lib/types";
import { fold } from "./normalize";
import { resolvePlaceholders, stripPlaceholders } from "./placeholders";
import type { DeterministicReply } from "./respond";

export const MAX_MODEL_TEXT_CHARS = 700;

export const modelOutputSchema = z.object({
  text: z.string().min(1).max(2000),
  productIds: z.array(z.string().max(80)).max(12),
  followUps: z.array(z.string().max(200)).max(5).optional(),
});

export type RejectReason =
  | "schema"
  | "digits"
  | "currency_or_percent"
  | "number_words"
  | "dates_or_current_claims"
  | "save_claim"
  | "health_or_allergen"
  | "competitor"
  | "markup"
  | "placeholder"
  | "too_long";

export type ValidatedModelReply =
  | { ok: true; text: string; productIds: string[]; followUps: string[] }
  | { ok: false; reason: RejectReason };

const CHECKS: [RejectReason, RegExp][] = [
  ["digits", /\d/],
  ["currency_or_percent", /\b(eur\w*|evr\w*|cent\w*|odstot\w*|procent\w*)\b/],
  ["number_words", /\b(dva|dve|dvema|tri|trije|stiri|pet|sest|sedem|osem|devet|deset|\w+najst|\w+deset|dvajset|sto|tisoc|polovic\w*)\b/],
  [
    "dates_or_current_claims",
    /\b(januar\w*|februar\w*|marc\w*|marec|april\w*|maj[au]?|junij\w*|julij\w*|avgust\w*|septemb\w*|oktob\w*|novemb\w*|decemb\w*|danes|jutri|vceraj|trenutno|ta teden|v trgovini|na zalogi|zalog\w*|razprodan\w*)\b/,
  ],
  ["save_claim", /\b(shranil\w*|shranjen\w*|shranim|dodal\w*|dodan\w*|dodam|odstranil\w*|odstranjen\w*|odstranim)\b/],
  ["health_or_allergen", /\b(alergen\w*|gluten\w*|laktoz\w*|kalorij\w*|kcal|beljakovin\w*|vitamin\w*|hranil\w*|zdrav(?!o\b)\w*|dieta\w*|ocen[ae] kupcev|mnenj\w*)\b/],
  ["competitor", /\b(mercator\w*|tus\w*|hofer\w*|lidl\w*|eurospin\w*|jager\w*|aldi\w*)\b/],
];

/** Check free prose (placeholders removed). Returns the first violated rule or null. */
export function checkProse(prose: string): RejectReason | null {
  if (/https?:|www\.|<\s*\/?\s*[a-z]/i.test(prose)) return "markup";
  const folded = fold(prose);
  for (const [reason, re] of CHECKS) {
    if (re.test(reason === "digits" ? prose : folded)) return reason;
  }
  return null;
}

export function validateModelOutput(raw: unknown, draft: DeterministicReply): ValidatedModelReply {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "schema" };
  const { text, productIds, followUps } = parsed.data;

  const prose = stripPlaceholders(text);
  const violation = checkProse(prose);
  if (violation) return { ok: false, reason: violation };

  const allowedProductIds = new Set(draft.candidateProductIds);
  const allowedOfferIds = new Set(draft.candidateProductIds.map((id) => getPrimaryOffer(id)?.id).filter((x): x is string => !!x));
  const allowedRecipeIds = new Set(draft.candidateRecipeIds);
  const resolved = resolvePlaceholders(text.trim(), { ...draft.placeholderCtx, allowedProductIds, allowedOfferIds, allowedRecipeIds });
  if (!resolved.ok) return { ok: false, reason: "placeholder" };
  const finalText = resolved.text.replace(/[ \t]+\n/g, "\n").trim();
  if (finalText.length > MAX_MODEL_TEXT_CHARS) return { ok: false, reason: "too_long" };

  const ids = Array.from(new Set(productIds.filter((id) => allowedProductIds.has(id)))).slice(0, 4);
  const safeFollowUps = (followUps ?? [])
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && f.length <= 80 && !/\{\{/.test(f) && checkProse(f) === null)
    .slice(0, 2);
  return { ok: true, text: finalText, productIds: ids, followUps: safeFollowUps };
}

/**
 * Blocks are always built server-side. The model may narrow the products block to a subset of the
 * intent's candidates; other blocks (recipe, choices, notices) stay as the deterministic draft built them.
 */
export function blocksForModelReply(draft: DeterministicReply, v: Extract<ValidatedModelReply, { ok: true }>): { blocks: MessageBlock[]; contextProductIds: string[] } {
  let contextProductIds = draft.contextProductIds;
  const blocks: MessageBlock[] = draft.blocks.map((b) => {
    if (b.type !== "products" || !v.productIds.length) return b;
    const offerIds = v.productIds.map((id) => getPrimaryOffer(id)?.id).filter((x): x is string => !!x);
    if (!offerIds.length) return b;
    contextProductIds = v.productIds;
    const next: Extract<MessageBlock, { type: "products" }> = { type: "products", offerIds, ...(b.layout ? { layout: b.layout } : {}) };
    if (b.reasons) {
      const reasons = Object.fromEntries(Object.entries(b.reasons).filter(([k]) => offerIds.includes(k)));
      if (Object.keys(reasons).length) next.reasons = reasons;
    }
    return next;
  });
  if (v.followUps.length && !blocks.some((b) => b.type === "choices")) {
    blocks.push({ type: "choices", options: v.followUps.map((f) => ({ label: f, message: f })) });
  }
  return { blocks, contextProductIds };
}
