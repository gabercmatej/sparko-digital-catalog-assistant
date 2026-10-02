/**
 * Anthropic implementation of ChatProvider (server-only).
 *
 * Verified against the installed @anthropic-ai/sdk 0.131.0:
 *  - `client.messages.create(params, { timeout })` (resources/messages/messages.d.ts)
 *  - structured output via `output_config: { format: { type: "json_schema", schema } }` (OutputConfig / JSONOutputFormat)
 *    — used instead of forced tool use because forced `tool_choice` is rejected by newer models (e.g. claude-sonnet-5-5)
 *  - `temperature` is deprecated for models released after Claude Opus 4.6 (only sent to older models such as Haiku 4.5)
 *  - client options `timeout` (ms) and `maxRetries` (client.d.ts); error classes exported from the package root
 *    (APIConnectionTimeoutError, RateLimitError, AuthenticationError, APIError — core/error.d.ts)
 *
 * Env: ANTHROPIC_API_KEY (required for live answers), AI_MODEL (default claude-haiku-4-5 for demo latency;
 * claude-sonnet-5-5 is the higher-quality option). Never log or return the key.
 */
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AuthenticationError, RateLimitError } from "@anthropic-ai/sdk";
import { MODEL_OUTPUT_JSON_SCHEMA, ProviderError, type ChatProvider, type ModelInput } from "./provider";

export const DEFAULT_AI_MODEL = "claude-haiku-4-5";
export const HIGH_QUALITY_AI_MODEL = "claude-sonnet-5-5";
export const AI_TIMEOUT_MS = 12_000;

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;
/** Minimal client surface (lets tests inject a mock). */
export type MessagesClient = {
  messages: { create(body: CreateParams, options?: { timeout?: number; signal?: AbortSignal }): Promise<Anthropic.Message> };
};

/** Models that still accept sampling parameters and do not take `effort` (Haiku 4.5 and older 4.x). */
function isLegacySamplingModel(model: string): boolean {
  return /claude-(haiku-4-5|sonnet-4-5|sonnet-4-6|opus-4-5|opus-4-6|opus-4-1|sonnet-4-0|opus-4-0)/.test(model);
}

export function buildRequest(model: string, input: ModelInput): CreateParams {
  const legacy = isLegacySamplingModel(model);
  const params: CreateParams = {
    model,
    // Newer models think adaptively and thinking tokens count toward max_tokens, so they get more room.
    max_tokens: legacy ? 400 : 1024,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    output_config: legacy
      ? { format: { type: "json_schema", schema: MODEL_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown> } }
      : { effort: "low", format: { type: "json_schema", schema: MODEL_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown> } },
  };
  if (legacy) params.temperature = 0.2;
  return params;
}

export function createAnthropicProvider(opts: { apiKey?: string; model?: string; timeoutMs?: number; client?: MessagesClient } = {}): ChatProvider {
  const model = (opts.model ?? "").trim() || DEFAULT_AI_MODEL;
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
  let client: MessagesClient | null = opts.client ?? null;

  return {
    name: "anthropic",
    model,
    async generate(input: ModelInput): Promise<unknown> {
      if (!client) {
        if (!opts.apiKey) throw new ProviderError("not_configured");
        client = new Anthropic({ apiKey: opts.apiKey, timeout: timeoutMs, maxRetries: 0 }) as unknown as MessagesClient;
      }
      let res: Anthropic.Message;
      try {
        res = await client.messages.create(buildRequest(model, input), { timeout: timeoutMs });
      } catch (err) {
        throw mapError(err);
      }
      if (res.stop_reason === "refusal") throw new ProviderError("refusal");
      if (res.stop_reason === "max_tokens") throw new ProviderError("malformed", "truncated");
      const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new ProviderError("malformed", "no text block");
      try {
        return JSON.parse(textBlock.text) as unknown;
      } catch {
        throw new ProviderError("malformed", "invalid json");
      }
    },
  };
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof APIConnectionTimeoutError) return new ProviderError("timeout");
  if (err instanceof APIUserAbortError) return new ProviderError("timeout");
  if (err instanceof RateLimitError) return new ProviderError("rate_limited");
  if (err instanceof AuthenticationError) return new ProviderError("not_configured", "auth");
  if (err instanceof APIConnectionError) return new ProviderError("api", "connection");
  if (err instanceof APIError) return new ProviderError("api", `status ${err.status ?? "?"}`);
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return new ProviderError("timeout");
  return new ProviderError("api", "unknown");
}

/** Provider from environment, or null when no key is configured. Does not expose env values. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): ChatProvider | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createAnthropicProvider({ apiKey, model: env.AI_MODEL });
}
