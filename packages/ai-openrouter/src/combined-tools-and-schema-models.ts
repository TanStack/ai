import type { OpenRouterModelOptionsByName } from './model-meta'

/**
 * OpenRouter catalog ids whose resolved upstream model natively supports
 * strict `json_schema` output **together with** `tools` in a single streaming
 * request — "combined mode" (issue #612, extends #605). When `chat({
 * outputSchema, tools, stream: true })` targets one of these, the engine wires
 * the schema into the regular `chatStream` request alongside `tools` and
 * harvests the schema-constrained JSON from the agent loop's final-turn text,
 * skipping the separate finalization round-trip. Ids **not** listed here take
 * the proven legacy finalization path.
 *
 * Membership mirrors the per-provider upstream gates that #605 maintains —
 * NOT the catalog's `responseFormat` support flag, which is too permissive
 * (it is also `true` for `claude-opus-4.1`, every `gemini-2.5*`, and `gpt-3.5*`,
 * all of which the upstream native adapters exclude from combined mode):
 *   - Anthropic: the Claude 4.5+ ids in the upstream
 *     `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS` gate (opus/sonnet/haiku);
 *     newer ids land here only once that gate adds them
 *   - Google: Gemini 3.x only
 *   - OpenAI: strict-`json_schema` era (gpt-4o-2024-08-06 and later), gpt-4.1,
 *     gpt-5*, o-series, and gpt-oss-* — tool-capable text variants only
 *   - x.ai: Grok 4.x (tool-capable; excludes the multi-agent variant)
 *
 * This file is handmade. `scripts/convert-openrouter-models.ts` overwrites
 * `model-meta.ts` and must re-export this set instead of regenerating it.
 *
 * Every entry must also exist in {@link OpenRouterModelOptionsByName} and carry
 * both `responseFormat` and `toolChoice` capability (guarded by the
 * `satisfies` check on `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODEL_IDS`
 * below), and exist in {@link OPENROUTER_CHAT_MODELS} (guarded by a unit test).
 */
type OpenRouterCombinedToolsAndSchemaModelId = {
  [K in keyof OpenRouterModelOptionsByName]: 'responseFormat' extends keyof OpenRouterModelOptionsByName[K]
    ? 'toolChoice' extends keyof OpenRouterModelOptionsByName[K]
      ? K
      : never
    : never
}[keyof OpenRouterModelOptionsByName]

const OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODEL_IDS = [
  // Anthropic — the Claude 4.5+ ids the upstream gate currently blesses.
  // Mirrors ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS exactly (through the
  // Claude 5 ids), plus the OpenRouter-only `-fast` variants of gated models.
  'anthropic/claude-fable-5',
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-opus-4.5',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-opus-4.7',
  'anthropic/claude-opus-4.7-fast',
  'anthropic/claude-opus-4.8',
  'anthropic/claude-opus-4.8-fast',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-sonnet-5',

  // Google — Gemini 3.x text models only (image-only ids stay on the legacy path)
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-pro-preview-customtools',
  'google/gemini-3.5-flash',
  'google/gemini-3.5-flash-lite',
  'google/gemini-3.6-flash',
  'google/gemini-3.7-flash',

  // OpenAI — strict-json_schema era, tool-capable text models.
  // Cut is gpt-4o-2024-08-06. The dated pin gpt-4o-mini-2024-07-18 predates
  // that launch, so it is not listed; the unpinned gpt-4o-mini alias is.
  'openai/gpt-4o',
  'openai/gpt-4o-2024-08-06',
  'openai/gpt-4o-2024-11-20',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-5-pro',
  'openai/gpt-5.1',
  'openai/gpt-5.1-codex',
  'openai/gpt-5.1-codex-max',
  'openai/gpt-5.1-codex-mini',
  'openai/gpt-5.2',
  'openai/gpt-5.2-chat',
  'openai/gpt-5.2-codex',
  'openai/gpt-5.2-pro',
  'openai/gpt-5.3-codex',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4-nano',
  'openai/gpt-5.4-pro',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-chat-latest',
  'openai/o1',
  'openai/o3',
  'openai/o3-mini',
  'openai/o3-mini-high',
  'openai/o3-pro',
  'openai/o4-mini',
  'openai/o4-mini-high',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',

  // x.ai — Grok 4.x (tool-capable; skip grok-4.20-multi-agent)
  'x-ai/grok-4.20',
  'x-ai/grok-4.3',
  'x-ai/grok-4.5',
  'x-ai/grok-4.6',
] as const satisfies ReadonlyArray<OpenRouterCombinedToolsAndSchemaModelId>

export const OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS = new Set<string>(
  OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODEL_IDS,
)
