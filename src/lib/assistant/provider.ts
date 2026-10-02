/**
 * Small language-model adapter. Exactly one complete implementation exists: ./anthropic.ts.
 * The provider only returns raw structured output; ./validate.ts decides what may be shown.
 */

export type ModelInput = {
  system: string;
  user: string;
};

/** Expected (unvalidated) model output shape. */
export type ModelOutput = {
  text: string;
  productIds: string[];
  followUps?: string[];
};

export type ProviderErrorKind = "not_configured" | "timeout" | "rate_limited" | "api" | "malformed" | "refusal";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  /** Resolves with the parsed JSON object (unknown shape) or rejects with ProviderError. */
  generate(input: ModelInput): Promise<unknown>;
}

/** JSON schema shared by the provider request (structured output) and documentation. */
export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "productIds"],
  properties: {
    text: { type: "string", description: "Kratek odgovor v slovenščini s placeholderji namesto številk." },
    productIds: { type: "array", items: { type: "string" }, description: "ID-ji izdelkov iz seznama kandidatov, ki naj se prikažejo." },
    followUps: { type: "array", items: { type: "string" }, description: "Največ dve kratki nadaljnji vprašanji uporabnika." },
  },
} as const;
