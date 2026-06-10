---
'@tanstack/ai-utils': minor
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': patch
---

Fix structured output validation rejecting `null` for optional fields, across both stream modes and every adapter.

Strict-mode structured output widens optional fields to `required` + nullable, so the provider returns `null` for an absent optional. Validating that `null` against the original schema then failed, because `.optional()` means `T | undefined`, not `T | null` — surfacing as a `StandardSchemaValidationError` (e.g. `Invalid type: Expected string but received null`).

The engine now undoes the widening as a single, schema-aware step the moment the structured output is captured, so the fix applies uniformly:

- The strict-conversion pass records a `NullWideningMap` marking exactly the positions where it added `null`, so the response can be un-widened precisely — no re-deriving or guessing which nulls were synthetic.
- `@tanstack/ai-utils` adds `undoNullWidening(value, map)` — a counterpart to `transformNullsToUndefined` that strips only the nulls the widening pass synthesized, preserving the ones a `.nullable()`/`.nullish()` field genuinely allows.
- The engine applies this via a new `finalStructuredOutput.normalize` hook the instant the result is captured, so **both** the `Promise<T>` result **and** the streaming `structured-output.complete` event carry the un-widened object. Previously only the `Promise<T>` path was corrected, and only for adapters that preserved provider nulls.
- `@tanstack/openai-base` adapters (and the OpenAI/Grok/Groq adapters built on them) no longer blind-strip every `null` from structured output via `transformStructuredOutput` — that default is now a passthrough. The blind strip masked the validation bug but also destroyed genuine `.nullable()` nulls; precise un-widening in the engine fixes both. The `transformStructuredOutput` hook remains for provider-specific reshaping.

Adapters that already preserve provider nulls (`@tanstack/ai-openrouter`, Anthropic, Gemini, Ollama) now get correct un-widening on their streaming structured output too, not just `Promise<T>`.
