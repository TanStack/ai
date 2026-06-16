# @tanstack/ai-event-client

## 0.6.1

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0

## 0.6.0

### Minor Changes

- [#723](https://github.com/TanStack/ai/pull/723) [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164) - Surface fal's billed units as `result.usage`. The fal adapters now read fal's `x-fal-billable-units` response header off the result fetch and expose the billed quantity (`usage.unitsBilled`) on the generation result, so consumers can compute exact media-generation cost without wrapping `fetch` themselves.
  - `TokenUsage` gains an optional `unitsBilled` field for usage-based (non-token) billing, denominated in the provider's priced unit.
  - `falImage`, `falAudio`, `falVideo`, `falSpeech`, and `falTranscription` populate `result.usage.unitsBilled` when fal reports it.
  - `VideoUrlResult` gains an optional `usage` slot; `getVideoJobStatus` now emits the `video:usage` event and returns `usage` when the completed result reports billed units.

- [#727](https://github.com/TanStack/ai/pull/727) [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0) - Add an `'error'` terminal to `ToolCallState`. When a tool execution produces an output error, the StreamProcessor now transitions the `tool-call` part to `state: 'error'` instead of parking it at `'input-complete'`.

  Previously an errored tool call left the tool-call part at `'input-complete'` forever, so UIs that render lifecycle from the part's `state` could not distinguish "still executing" from "failed" without reverse-engineering the error-shaped `output` or the sibling `tool-result` part. The new terminal makes the tool-call state machine self-describing and symmetric with `ToolResultState` (which already has `'error'`):

  ```ts
  if (part.type === 'tool-call' && part.state === 'error') {
    // render failure — no more inferring from output shape
  }
  ```

  The completion safety net (`RUN_FINISHED` / stream finalization) no longer downgrades a failed tool call back to `'input-complete'`, including when an `output-error` result arrives before `TOOL_CALL_END`.

### Patch Changes

- [#696](https://github.com/TanStack/ai/pull/696) [`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23) - Surface server-executed tool results in devtools from the `TOOL_CALL_RESULT` event. The devtools middleware previously read results only off `TOOL_CALL_END`, which the adapter emits before the tool runs (so it carries no result). Now that `chat()` no longer re-emits a post-execution `TOOL_CALL_END` (see the `@tanstack/ai` [#519](https://github.com/TanStack/ai/issues/519) fix), results travel on the spec-compliant `TOOL_CALL_RESULT` event — the middleware now handles it so devtools keeps showing server-tool output.

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8)]:
  - @tanstack/ai@0.27.0

## 0.5.2

### Patch Changes

- [#683](https://github.com/TanStack/ai/pull/683) [`7adff0f`](https://github.com/TanStack/ai/commit/7adff0f192e50c081b569ffb80bf65df2a404a1f) - Defer devtools runtime-id generation to first use so importing `@tanstack/ai` is safe in edge/global scope.

  `@tanstack/ai-event-client` previously seeded its runtime id at module scope by calling `crypto.randomUUID()` (falling back to `Math.random()`) inside a top-level IIFE. Because `@tanstack/ai`'s `chat()` always pulls in the devtools middleware, this random-value generation ran at module-evaluation time. Edge runtimes such as Cloudflare Workers forbid generating random values in global scope, so simply importing `chat()` crashed the Worker with `Disallowed operation called within global scope`.

  The runtime id is now generated lazily on first use (inside `getAIDevtoolsRuntimeId()` / `createAIDevtoolsEventEnvelope()`) and memoized, so evaluating the module performs no random-value generation. The cross-bundle global (`globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__`) and the generated values are unchanged. Fixes [#667](https://github.com/TanStack/ai/issues/667).

- Updated dependencies []:
  - @tanstack/ai@0.26.1

## 0.5.1

### Patch Changes

- Updated dependencies [[`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010)]:
  - @tanstack/ai@0.26.0

## 0.5.0

### Minor Changes

- [#242](https://github.com/TanStack/ai/pull/242) [`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f) - Enhanced token usage reporting for every provider.

  `TokenUsage` is now the single canonical run-usage type. It is defined once in
  `@tanstack/ai-event-client` (the dependency-free leaf package) and re-exported by
  `@tanstack/ai`, so the two packages can no longer drift. It carries optional
  detailed breakdowns alongside the core token counts: `promptTokensDetails` /
  `completionTokensDetails` (cached, reasoning, audio, and per-modality tokens),
  `durationSeconds` for duration-billed models (e.g. Whisper transcription),
  `providerUsageDetails` for provider-specific metrics, and `cost` / `costDetails`
  for provider-reported cost — so a single `usage` shape covers counts, detailed
  breakdowns, and cost.

  `TokenUsage` is generic over its provider details bag —
  `TokenUsage<TProviderDetails = ProviderUsageDetails>` — so adapters return a
  strongly-typed `providerUsageDetails` (e.g. `TokenUsage<AnthropicProviderUsageDetails>`)
  while generic consumers keep the open-record default. The default,
  `ProviderUsageDetails` (`Record<string, NonNullable<unknown>>`), is now exported and
  uses non-nullish values rather than `unknown` so `TokenUsage` stays assignable across
  JSON-serialization boundaries (e.g. TanStack Start server-fn return types). Each
  provider's usage
  extractor now returns `undefined` (rather than fabricating zeroed totals) when
  the provider reports no usage object, so an absent `usage` is distinguishable
  from a genuine zero-token run.

  `@tanstack/ai` still exports `UsageTotals` as a `@deprecated` alias of
  `TokenUsage` for backward compatibility; it will be removed in a future release.

  Detailed usage is extracted in one place per SDK surface: OpenAI-compatible
  providers (OpenAI, Grok, Groq) share the extractors in `@tanstack/openai-base`,
  while Anthropic, Gemini, Ollama, and OpenRouter normalize their own provider
  usage. The devtools surface cached and reasoning token badges per iteration.

  Usage is now unified across **every modality**, not just text/chat. Image, audio,
  and text-to-speech results report the same canonical `TokenUsage` (with
  per-modality breakdowns) instead of a minimal `inputTokens`/`outputTokens` shape:
  - `ImageGenerationResult.usage`, `AudioGenerationResult.usage`, and the new
    `TTSResult.usage` are now typed as `TokenUsage`. **Breaking:** consumers of
    these fields should read `promptTokens`/`completionTokens` instead of
    `inputTokens`/`outputTokens`. `@tanstack/ai-event-client`'s `ImageUsage` is now
    a `@deprecated` alias of `TokenUsage`.
  - OpenAI/Grok image generation surface the text-vs-image input token breakdown
    (`promptTokensDetails`), Gemini image/audio/TTS now surface their full
    `usageMetadata` (previously dropped), and OpenRouter image generation surfaces
    the chat usage it already returns.
  - Bug fixes: Ollama no longer produces `NaN` totals or discards duration-only
    usage; Anthropic defaults missing `output_tokens` and no longer emits empty
    `promptTokensDetails`/`providerUsageDetails` objects; OpenAI GPT-4o
    transcription reads the real audio/text input token breakdown and never falls
    back to duration billing.

  Cross-adapter usage parity fixes:
  - `PromptTokensDetails`/`CompletionTokensDetails` gain a `documentTokens` field,
    and Gemini now surfaces `DOCUMENT` modality token counts (e.g. PDF inputs)
    instead of silently dropping them.
  - OpenAI-compatible chat (OpenAI/Grok/Groq via `@tanstack/openai-base`) now
    surfaces Predicted-Outputs `acceptedPredictionTokens`/`rejectedPredictionTokens`
    under `providerUsageDetails`, matching the OpenRouter adapter (rejected
    prediction tokens are billed).
  - Grok transcription (`/v1/stt`) now reports `durationSeconds`, mirroring the
    Whisper-1 path in the OpenAI transcription adapter.

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai@0.25.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai@0.24.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`94bb9c0`](https://github.com/TanStack/ai/commit/94bb9c0f3a3e56a0c6c8b7c78f44ae41288aecc3)]:
  - @tanstack/ai@0.23.1

## 0.4.1

### Patch Changes

- Updated dependencies [[`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314), [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai@0.23.0

## 0.4.0

### Minor Changes

- [#632](https://github.com/TanStack/ai/pull/632) [`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855) - Add hook-aware AI devtools registration, run tracking, state snapshots, and tool fixture replay.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai@0.22.1

## 0.3.11

### Patch Changes

- Updated dependencies [[`02f7d04`](https://github.com/TanStack/ai/commit/02f7d0427a406bd2dda6f5a51d1ef1d2600d5ac9)]:
  - @tanstack/ai@0.22.0

## 0.3.10

### Patch Changes

- Populate server-executed tool results on the matching `tool-call` part and mark successful tool calls as `complete`. ([#596](https://github.com/TanStack/ai/pull/596))

- Updated dependencies [[`e144a53`](https://github.com/TanStack/ai/commit/e144a53e4348bb0bc365dbe342c8538544242227)]:
  - @tanstack/ai@0.21.3

## 0.3.9

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2

## 0.3.8

### Patch Changes

- Updated dependencies [[`573f12e`](https://github.com/TanStack/ai/commit/573f12eb5a3b04a2625be92900099f48d6f76632)]:
  - @tanstack/ai@0.21.1

## 0.3.7

### Patch Changes

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0

## 0.3.6

### Patch Changes

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1

## 0.3.5

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

## 0.3.4

### Patch Changes

- Updated dependencies [[`617b5b5`](https://github.com/TanStack/ai/commit/617b5b512a6b3989c442efa41975dacc194d882a)]:
  - @tanstack/ai@0.19.1

## 0.3.3

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0

## 0.3.0

### Minor Changes

- fix(ai-gemini): read/write thoughtSignature at Part level + thread typed metadata through tool-call lifecycle ([#459](https://github.com/TanStack/ai/pull/459))

  Two fixes shipped together because the adapter fix is only effective once the framework also preserves provider metadata across the tool-call round-trip.

  **Adapter (Gemini):** Gemini emits `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The `FunctionCall` type has never had a `thoughtSignature` property. The adapter was reading from `functionCall.thoughtSignature` (does not exist in SDK types) and writing it back nested inside `functionCall`, causing Gemini 3.x to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.
  - **Read side:** reads `part.thoughtSignature` directly using the SDK's typed `Part` interface
  - **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall`

  **Framework (typed tool-call metadata):**
  - `ToolCall.providerMetadata: Record<string, unknown>` is now `ToolCall<TMetadata>.metadata?: TMetadata`, mirroring the existing typed-metadata pattern on content parts (`ImagePart<TMetadata>`, `AudioPart<TMetadata>`, etc.).
  - `ToolCallPart` gains a typed `metadata?: TMetadata` field (also generic).
  - `ToolCallStartEvent.providerMetadata` becomes `metadata` (kept as `Record<string, unknown>` because the AGUIEvent discriminated union does not survive a generic on the event type; adapters cast to their typed shape when emitting).
  - `BaseTextAdapter` and `TextAdapter` gain a sixth generic `TToolCallMetadata` (default `unknown`), exposed via `~types.toolCallMetadata` for inference at call sites.
  - `InternalToolCallState` gains a `metadata?: Record<string, unknown>` field captured at `TOOL_CALL_START` and threaded through `updateToolCallPart`, `buildAssistantMessages`, `modelMessageToUIMessage`, and `completeToolCall`, fixing a previously-silent drop of provider metadata across the client-side UIMessage pipeline (closes the gap surfaced in #403/#404).

  **Gemini concrete impl:** new `GeminiToolCallMetadata { thoughtSignature?: string }` exported from `@tanstack/ai-gemini`. The adapter declares its `TToolCallMetadata` as this type, so consumers see `toolCall.metadata?.thoughtSignature` typed end-to-end.

  **Breaking:** consumers reading `toolCall.providerMetadata` or `toolCallStartEvent.providerMetadata` should rename to `metadata`.

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0

## 0.2.9

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508)]:
  - @tanstack/ai@0.15.0

## 0.2.8

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`633a3d9`](https://github.com/TanStack/ai/commit/633a3d93fff27e3de7c10ce0059b2d5d87f33245)]:
  - @tanstack/ai@0.11.1

## 0.2.4

### Patch Changes

- Update the devtools middleware to match `@tanstack/ai`'s AG-UI-compliant event shapes so emitted instrumentation remains accurate after the strip-to-spec pass. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai@0.11.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`4445410`](https://github.com/TanStack/ai/commit/44454100e5825f948bab0ce52c57c80d70c0ebe7)]:
  - @tanstack/ai@0.10.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai@0.10.1

## 0.2.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`26d8243`](https://github.com/TanStack/ai/commit/26d8243bab564a547fed8adb5e129d981ba228ea)]:
  - @tanstack/ai@0.9.2

## 0.1.3

### Patch Changes

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1

## 0.1.0

### Minor Changes

- feat: add middleware system and content guard middleware ([#367](https://github.com/TanStack/ai/pull/367))
  - **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
  - **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
  - **@tanstack/ai-client**: Updated event types for middleware integration.
  - **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
