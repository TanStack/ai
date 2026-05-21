# @tanstack/openai-base

## 0.3.5

### Patch Changes

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0

## 0.3.4

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/typescript/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1

## 0.3.3

### Patch Changes

- feat(ai): `systemPrompts` accept `{ content, metadata }` with adapter-inferred metadata typing ([#575](https://github.com/TanStack/ai/pull/575))

  `chat({ systemPrompts })` now accepts either a plain string (the existing
  shape — fully backward compatible) or `{ content, metadata }`. The `metadata`
  field's type is inferred from the adapter via a new
  `TSystemPromptMetadata` generic on `TextAdapter` / `BaseTextAdapter`:
  - `@tanstack/ai-anthropic` declares `AnthropicSystemPromptMetadata` →
    users get `cache_control` autocomplete and type-checking on
    `systemPrompts[i].metadata` for Anthropic chats.
  - Adapters with no per-prompt metadata (OpenAI, Gemini, Ollama,
    OpenRouter, openai-base) inherit the default `never`, which means the
    `metadata` field carries no meaningful value at the call site —
    TypeScript only accepts `undefined` there. Provider-foreign metadata
    that reaches an adapter via JS / `as any` is silently dropped, never
    written to the wire.

  ```ts
  import { chat } from '@tanstack/ai'
  import { anthropicText } from '@tanstack/ai-anthropic'

  // Anthropic — `cache_control` is autocompleted, no `satisfies` needed.
  chat({
    adapter: anthropicText({ apiKey }, 'claude-sonnet-4-6'),
    systemPrompts: [
      {
        content: 'Stable instructions — cache me.',
        metadata: { cache_control: { type: 'ephemeral' } },
      },
      'Volatile per-request instruction.',
    ],
  })

  // OpenAI — `metadata` is `never`; only `undefined` is assignable, so the
  // field is effectively unusable. The object form without `metadata` still
  // works for portability.
  chat({
    adapter: openaiText({ apiKey }, 'gpt-4o-mini'),
    systemPrompts: [
      'Plain string.',
      { content: 'Object form without metadata is allowed.' },
    ],
  })
  ```

  New exports:
  - `@tanstack/ai`: `SystemPrompt`, `NormalizedSystemPrompt` types and the
    `normalizeSystemPrompts()` helper adapters use to normalize the wide
    input shape to `{ content, metadata? }` before consumption.
  - `@tanstack/ai-anthropic`: `AnthropicSystemPromptMetadata` interface
    (currently exposes `cache_control` for prompt caching).

  Internal:
  - New `TSystemPromptMetadata = never` generic on `TextAdapter` /
    `BaseTextAdapter`, surfaced via `'~types'['systemPromptMetadata']`
    for inference at the `chat()` call site.
  - Anthropic adapter reads `metadata.cache_control` and attaches it to
    the corresponding `TextBlockParam`.
  - All other text adapters call `normalizeSystemPrompts()` and join
    `.content` for their respective `instructions` / `system` /
    `systemInstruction` fields. Foreign metadata that reaches them via JS
    / `as any` is dropped (never written to the wire).
  - `normalizeSystemPrompts()` is the public API boundary and throws
    `TypeError` (naming the offending index) for object-form entries whose
    `content` isn't a string — preventing literal `"undefined"` from
    reaching the model on stale call sites.
  - OpenTelemetry middleware attaches per-prompt metadata as the
    `tanstack.ai.system_prompt.metadata` JSON span attribute when
    `captureContent: true` and at least one entry carries metadata, so
    observability backends can distinguish cache hit/miss for Anthropic.
  - `@tanstack/ai-event-client` mirrors the `SystemPrompt` shape locally
    (avoids a circular import) and projects metadata away on the devtools
    wire — devtools UI still receives `Array<string>`.

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai@0.20.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0

## 0.3.0

### Minor Changes

- Streaming structured output across the OpenAI-compatible providers, an OpenAI Chat Completions sibling adapter, a summarize-subsystem unification, and the decoupling of `@tanstack/ai-openrouter` from the shared OpenAI base. ([#527](https://github.com/TanStack/ai/pull/527))

  ## Core — `@tanstack/ai`
  - New `chat({ outputSchema, stream: true })` overload returning `StructuredOutputStream<InferSchemaType<TSchema>>`. The stream yields raw JSON deltas via `TEXT_MESSAGE_CONTENT` plus a terminal `CUSTOM` `structured-output.complete` event whose `value.object` is typed against the caller's schema with no helper or cast required.
  - `StructuredOutputStream<T>` is a discriminated union over three tagged `CUSTOM` variants — `structured-output.complete<T>`, `approval-requested`, and `tool-input-available` (new `ApprovalRequestedEvent` / `ToolInputAvailableEvent` interfaces exported from `@tanstack/ai`). Narrowing on `chunk.type === 'CUSTOM' && chunk.name === '<literal>'` resolves `chunk.value` to the exact shape per variant. The bare `CustomEvent` (with `value: any`) is deliberately excluded to keep the narrow from collapsing to `any`; user-emitted events via the `emitCustomEvent` context API still flow at runtime and are documented as a small residual gap.
  - Activity-layer hardening: always-finalise after the stream loop (no silent hangs on missing `finishReason`), typed `RUN_ERROR` on empty content, mid-stream provider errors terminate cleanly, schema-validation failures carry `runId / model / timestamp`.
  - `fallbackStructuredOutputStream` in the activity layer is the single source of truth for adapters that don't implement `structuredOutputStream` natively; `BaseTextAdapter` no longer ships a default.
  - `ChatStreamSummarizeAdapter.summarizeStream` accumulates summary text and emits a terminal `CUSTOM` `generation:result` event before the final `RUN_FINISHED`. Fixes `useSummarize` never populating `result` over streaming connections (the client only sets `result` on that specific CUSTOM event).
  - `SummarizationOptions` is now generic in `TProviderOptions` and `modelOptions` is plumbed through end-to-end (previously silently dropped by `runSummarize` / `runStreamingSummarize`).

  ## Framework hooks — `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`, `@tanstack/ai-svelte`

  `useChat` (React/Vue/Solid) and `createChat` (Svelte) now accept an `outputSchema` option mirroring `chat({ outputSchema })` on the server. When supplied, the hook's return adds two managed reactive fields:
  - `partial` — the live progressive object, typed `DeepPartial<InferSchemaType<typeof outputSchema>>`. Updated from `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON`. Resets on every new run.
  - `final` — the validated terminal payload from the `structured-output.complete` event, typed `InferSchemaType<typeof outputSchema> | null`. `null` until the run completes.

  Both fields are typed against the schema with no helper or cast — each hook is generic on `TSchema` and conditionally adds the fields to the return type. Without `outputSchema`, the return type is unchanged. Works the same for streaming and non-streaming endpoints — for non-streaming, `partial` stays `{}` and `final` snaps when the single terminal event arrives. Reasoning text and tool calls aren't surfaced as separate hook fields — they're already on `messages[…].parts` (as `ThinkingPart`, `ToolCallPart`, `ToolResultPart`), same as a normal chat. When `outputSchema` is set, the assistant's `TextPart` contains the raw JSON the model produced; filter `text` parts out of your message renderer and let the structured view (driven by `partial` / `final`) replace it.

  Reactivity primitive per framework:

  | Framework                      | `partial` type                                          | `final` type                                     |
  | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
  | React (`@tanstack/ai-react`)   | `DeepPartial<T>` (plain state)                          | `T \| null` (plain state)                        |
  | Vue (`@tanstack/ai-vue`)       | `Readonly<ShallowRef<DeepPartial<T>>>`                  | `Readonly<ShallowRef<T \| null>>`                |
  | Solid (`@tanstack/ai-solid`)   | `Accessor<DeepPartial<T>>`                              | `Accessor<T \| null>`                            |
  | Svelte (`@tanstack/ai-svelte`) | `readonly partial: DeepPartial<T>` (rune-backed getter) | `readonly final: T \| null` (rune-backed getter) |

  `DeepPartial<T>` is exported from each framework package for callers who want to annotate handlers explicitly.

  ## Base — `@tanstack/openai-base`
  - Package renamed from `@tanstack/ai-openai-compatible` (which remains published for pinned lockfiles but receives no further updates). Imports change:

    ```diff
    - import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
    - import { OpenAICompatibleResponsesTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
    ```

  - Centralised `structuredOutputStream` on both bases. Chat Completions uses `response_format: { type: 'json_schema', strict: true }` + `stream: true`; Responses uses `text.format: { type: 'json_schema', strict: true }` + `stream: true`. Subclasses (`ai-openai`, `ai-grok`, `ai-groq`) inherit it; OpenRouter implements its own (see below).
  - Base now adopts the `openai` SDK directly and imports types from `openai/resources/...`. The previously-vendored ~720 LOC of wire-format types (`ChatCompletion`, `ResponseStreamEvent`, etc.) is removed; consumers that imported wire types from the package should import them from the openai SDK instead. The abstract `callChatCompletion*` / `callResponse*` hooks are gone — the base constructor now takes a pre-built `OpenAI` client (`new OpenAIBaseChatCompletionsTextAdapter(model, name, openaiClient)`) and calls `client.chat.completions.create` / `client.responses.create` itself.
  - New protected `isAbortError(error)` hook duck-types abort detection so `RUN_ERROR { code: 'aborted' }` is emitted consistently across SDK error types — subclasses with proprietary error classes (e.g. `@openrouter/sdk`'s `RequestAbortedError`) override.
  - Per-chunk `logger.provider(...)` debug logging now fires inside `structuredOutputStream` loops, matching the existing pattern in `chatStream` for end-to-end introspection in debug mode.

  The other extension hooks (`extractReasoning`, `extractTextFromResponse`, `processStreamChunks`, `makeStructuredOutputCompatible`, `transformStructuredOutput`, `mapOptionsToRequest`, `convertMessage`) remain. Groq's `processStreamChunks` and `makeStructuredOutputCompatible` overrides (for `x_groq.usage` promotion and Groq's structured-output schema quirks) are unchanged.

  ## Provider adapters

  | Adapter                                                    | API              | Reasoning surface                                                                                                |
  | ---------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `@tanstack/ai-openai` `openaiText`                         | Responses        | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` (requires `reasoning.summary: 'auto'`) |
  | `@tanstack/ai-openai` `openaiChatCompletions` (new)        | Chat Completions | reasoning emitted silently — Chat Completions has no `reasoning.summary` opt-in                                  |
  | `@tanstack/ai-grok` `grokText`                             | Chat Completions | `delta.reasoning_content` (DeepSeek convention; not typed by OpenAI SDK)                                         |
  | `@tanstack/ai-groq` `groqText`                             | Chat Completions | `delta.reasoning` (requires `reasoning_format: 'parsed'`; not typed by groq-sdk)                                 |
  | `@tanstack/ai-openrouter` `openRouterText`                 | Chat Completions | `delta.reasoningDetails` (camelCase)                                                                             |
  | `@tanstack/ai-openrouter` `openRouterResponsesText` (beta) | Responses (beta) | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` via `normalizeStreamEvent`             |

  All six emit the contractual `REASONING_*` lifecycle (`REASONING_START` → `REASONING_MESSAGE_START` → `REASONING_MESSAGE_CONTENT` deltas → `REASONING_MESSAGE_END` → `REASONING_END`) and close it before `TEXT_MESSAGE_START`. Accumulated reasoning is also surfaced on `structured-output.complete.value.reasoning` for consumers that only subscribe to the terminal event. OpenRouter SDK's proprietary `RequestAbortedError` is mapped (alongside DOM `AbortError`) to `code: 'aborted'` in the two openrouter adapters.

  `@tanstack/ai-openai` also exports a new `OpenAIChatCompletionsTextAdapter` / `openaiChatCompletions` / `createOpenaiChatCompletions` factory — a sibling to the existing Responses adapter for callers who want the older `/v1/chat/completions` wire format against the OpenAI SDK.

  ## Decouple `@tanstack/ai-openrouter` from the OpenAI base

  OpenRouter ships its own SDK (`@openrouter/sdk`) with a camelCase shape, so inheriting from the OpenAI-shaped base forced a snake_case ↔ camelCase round-trip on every request and stream event. ai-openrouter now extends `BaseTextAdapter` directly and inlines its own stream processors (`OpenRouterTextAdapter` for chat-completions, `OpenRouterResponsesTextAdapter` for the Responses beta), reading OpenRouter's camelCase types natively. The `@tanstack/openai-base` and `openai` dependencies are removed from ai-openrouter; only `@openrouter/sdk`, `@tanstack/ai`, and `@tanstack/ai-utils` remain. The ~300 LOC of inbound/outbound shape converters (`toOpenRouterRequest`, `toChatCompletion`, `adaptOpenRouterStreamChunks`, `toSnakeResponseResult`, …) are gone. Internal: duck-typed `as { ... }` casts on stream chunks in `OpenRouterResponsesTextAdapter` are replaced with direct narrowing via the SDK's discriminated unions.

  Public OpenRouter API is unchanged: `openRouterText`, `openRouterResponsesText`, `createOpenRouterText`, `createOpenRouterResponsesText`, the OpenRouter tool factories, provider routing surface (`provider`, `models`, `plugins`, `variant`, `transforms`), app attribution headers (`httpReferer`, `appTitle`), `:variant` model suffixing, `RequestAbortedError` propagation, and the OpenRouter-specific structured-output null-preservation all behave the same.

  `ai-ollama` remains on `BaseTextAdapter` directly — its native API uses a different wire format from Chat Completions and was never on the shared base.

  ## Summarize subsystem

  Anthropic, Gemini, Ollama, and OpenRouter previously each shipped a bespoke 200–300 LOC summarize adapter. They now construct a `ChatStreamSummarizeAdapter` (formerly `ChatStreamWrapperAdapter`, renamed and exported from `@tanstack/ai/activities`) wrapping their own text adapter, matching the existing OpenAI/Grok pattern. Removes ~600 LOC of duplicated logic across the six providers and ensures behavioural parity.

  Bespoke `*SummarizeProviderOptions` interfaces (e.g. `OpenAISummarizeProviderOptions`, `AnthropicSummarizeProviderOptions`, `GeminiSummarizeProviderOptions`, `OllamaSummarizeProviderOptions`, `OpenRouterSummarizeProviderOptions`) are removed from the provider packages' public exports. Consumers who imported them should switch to inferring the type from the adapter (`InferTextProviderOptions<typeof adapter>`) or remove the explicit annotation (it'll be inferred from the adapter argument).

  `SummarizeAdapter` interface methods are now generic in `TProviderOptions`. `summarize` and `summarizeStream` previously took `SummarizationOptions` (defaulted, so `modelOptions` was effectively `Record<string, any>` regardless of the adapter's typed shape). They now take `SummarizationOptions<TProviderOptions>`. Source-compatible for callers that didn't specify the generic; type-tighter for implementers and downstream consumers. `SummarizationOptions`, `SummarizeAdapter`, `BaseSummarizeAdapter`, and `ChatStreamSummarizeAdapter` previously had a mixed `Record<string, any>` / `Record<string, unknown>` / `object` set of defaults for `TProviderOptions`; they now uniformly default to `Record<string, unknown>`.

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0

> Renamed from `@tanstack/openai-base` in 0.3.0. See the [README](./README.md) for context.

## 0.2.1

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0

## 0.2.0

### Minor Changes

- New package: shared base adapters and utilities for OpenAI-compatible providers. Includes Chat Completions and Responses API text adapter base classes, image/summarize/transcription/TTS/video adapter base classes, schema converter, 15 tool converters, and shared types. Providers extend these base classes to reduce duplication and ensure consistent behavior. ([#409](https://github.com/TanStack/ai/pull/409))

### Patch Changes

- Updated dependencies [[`27c9aeb`](https://github.com/TanStack/ai/commit/27c9aeb80993f8262e65ef623a4cc6dadf18817e)]:
  - @tanstack/ai-utils@0.2.0
