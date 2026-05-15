# @tanstack/ai

## 0.17.0

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

- Update `@fal-ai/client` dependency to `^1.10.1`. Picks up upstream retry-on-transport-error and proxy-runtime-gate improvements. No public adapter API changes — `fal.config`, `fal.subscribe`, `fal.queue.{submit,status,result}` are unchanged. ([#556](https://github.com/TanStack/ai/pull/556))

  The fal type-meta narrowing now covers four cases per model, each strict:
  - `aspect_ratio` + `resolution` → `"16:9_1080p"` style template literal
  - `aspect_ratio` only → the aspect-ratio union (`"16:9" | "9:16" | …`)
  - `resolution` only → the resolution union (`"1080p" | "1440p" | "2160p"`) — new
  - neither → `undefined` (the model has no size knob, so you must omit `size`)

  For example, `fal-ai/ltx-2/text-to-video/fast` (resolution-only) now type-checks `size: '2160p'`, and `fal-ai/kling-video/v2.6/pro/image-to-video` (neither field) refuses any `size` value at compile time.

  The "neither" case uses `undefined` instead of `never` so the adapter class still satisfies the generic `VideoAdapter<string, any, any, any>` (method-parameter contravariance: `any` can't flow into `never` but it does flow into `undefined`).

  To support the `undefined` slot, `@tanstack/ai`'s `BaseImageAdapter`/`BaseVideoAdapter` (and the matching `ImageGenerationOptions`/`VideoGenerationOptions` types) widen their `TSize` constraint from `extends string` to `extends string | undefined`. The default remains `string`, so existing adapters and call sites are unaffected.

  `Extract<…['aspect_ratio'], string>` filters out the new `AspectRatio` object type that upstream 1.10 introduced on `AgeModifyInput`/`CityTeleportInput`, keeping the template-literal sizes valid for those endpoints.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.1

## 0.16.0

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
  - @tanstack/ai-event-client@0.3.0

## 0.15.0

### Minor Changes

- **OpenTelemetry middleware.** `otelMiddleware({ tracer, meter?, captureContent?, redact?, ... })` emits GenAI-semantic-convention traces and metrics for every `chat()` call. ([#500](https://github.com/TanStack/ai/pull/500))
  - Root span per `chat()` + child span per agent-loop iteration (named `chat <model> #<iteration>`) + grandchild span per tool call.
  - `gen_ai.client.operation.duration` (seconds) recorded **once per `chat()` call**; `gen_ai.client.token.usage` (tokens) recorded **per iteration** (one input + one output record). Metric attributes are kept low-cardinality — `gen_ai.response.model` and `gen_ai.response.id` are intentionally excluded.
  - `captureContent: true` attaches prompt/completion content as `gen_ai.{user,system,assistant,tool}.message` and `gen_ai.choice` span events. Redactor failures fail closed to a `"[redaction_failed]"` sentinel — raw content never leaks. Assistant text is capped at `maxContentLength` (default 100 000).
  - Four extension points for custom attributes, names, span-options, and end-of-span callbacks. Thrown callbacks are caught and logged to `console.warn` with a label so failures remain diagnosable.
  - `@opentelemetry/api` is an optional peer dependency. The middleware is exported from the dedicated subpath `@tanstack/ai/middlewares/otel` so that importing `@tanstack/ai/middlewares` does not eagerly require OTel.

  See `docs/advanced/otel.md` for the full guide.

- **Fix thinking blocks getting merged across steps and lost on turn 2+ of Anthropic tool loops.** ([#391](https://github.com/TanStack/ai/pull/391))

  Each thinking step emitted by the adapter now produces its own `ThinkingPart` on the `UIMessage` instead of being merged into a single part, and thinking content + Anthropic signatures are preserved in server-side message history so multi-turn tool flows with extended thinking work correctly.

  This includes a public callback signature change: `StreamProcessorEvents.onThinkingUpdate` now receives `(messageId, stepId, content)` instead of `(messageId, content)`. `ChatClient` has been updated to handle the new `stepId` argument internally, but consumers implementing `StreamProcessorEvents` directly need to add the new parameter.

  `@tanstack/ai`:
  - `ThinkingPart` gains optional `stepId` and `signature` fields.
  - `ModelMessage` gains an optional `thinking?: Array<{ content; signature? }>` field so prior thinking can be replayed in subsequent turns.
  - `StepFinishedEvent` gains an optional `signature` field for provider-supplied thinking signatures.
  - `StreamProcessor` tracks thinking per-step via `stepId` and keeps step ordering. `getState().thinking` / `getResult().thinking` concatenate step contents in order.
  - The `onThinkingUpdate` callback on `StreamProcessorEvents` now receives `(messageId, stepId, content)` — consumers implementing it directly must add the `stepId` parameter.
  - `TextEngine` accumulates thinking + signatures per iteration and includes them in assistant messages with tool calls so the next turn can replay them.

  `@tanstack/ai-anthropic`:
  - Captures `signature_delta` stream events and emits the final `STEP_FINISHED` with the signature on `content_block_stop`.
  - Includes thinking blocks with signatures in `formatMessages` for multi-turn history.
  - Passes `betas: ['interleaved-thinking-2025-05-14']` to the `beta.messages.create` call site when a thinking budget is configured. The beta flag is scoped to the streaming path only, so `structuredOutput` (which uses the non-beta `messages.create` endpoint) is unaffected.

  `@tanstack/ai-client`:
  - `ChatClient`'s internal `onThinkingUpdate` wiring is updated for the new `stepId` parameter.

### Patch Changes

- Fix `tool_use.name: String should have at least 1 character` 400 from Anthropic when sending a follow-up message after approving a tool that needs approval (issue #532). ([#536](https://github.com/TanStack/ai/pull/536))

  The agent loop's continuation re-emit of `TOOL_CALL_START` after a server-side post-approval execution now includes the AG-UI spec field `toolCallName` alongside the deprecated `toolName` alias, so the client's `StreamProcessor` records a tool-call part with a defined `name` instead of `undefined`. As a defensive measure, `StreamProcessor` also accepts the deprecated `toolName` field as a fallback when `toolCallName` is missing.

  The post-approval execution also now replaces the `pendingExecution: true` placeholder tool message in the agent loop's message history with the real tool result, instead of appending a duplicate. This prevents the Anthropic adapter's `tool_result` de-dup (which keeps the first match) from discarding the real result, so the model sees the actual tool output during the post-approval streaming response.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.9

## 0.14.0

### Minor Changes

- feat: add generateAudio activity for music and sound-effect generation ([#463](https://github.com/TanStack/ai/pull/463))

  Adds a new `audio` activity kind alongside the existing `tts` and `transcription` activities:
  - `generateAudio()` / `createAudioOptions()` functions
  - `AudioAdapter` interface and `BaseAudioAdapter` base class
  - `AudioGenerationOptions` / `AudioGenerationResult` / `GeneratedAudio` types
  - `audio:request:started`, `audio:request:completed`, and `audio:usage` devtools events

- feat: add `useGenerateAudio` hook and streaming support for `generateAudio()` ([#463](https://github.com/TanStack/ai/pull/463))

  Closes the parity gap between audio generation and the other media
  activities (image, speech, video, transcription, summarize):
  - `generateAudio()` now accepts `stream: true`, returning an
    `AsyncIterable<StreamChunk>` that can be piped through
    `toServerSentEventsResponse()`.
  - `AudioGenerateInput` type added to `@tanstack/ai-client`.
  - `useGenerateAudio` hook added to `@tanstack/ai-react`,
    `@tanstack/ai-solid`, and `@tanstack/ai-vue`; matching
    `createGenerateAudio` added to `@tanstack/ai-svelte`. All follow the same
    `{ generate, result, isLoading, error, status, stop, reset }` shape as
    the existing media hooks and support both `connection` (SSE) and
    `fetcher` transports.

- Tighten `GeneratedImage` and `GeneratedAudio` to enforce exactly one of `url` or `b64Json` via a mutually-exclusive `GeneratedMediaSource` union. ([#463](https://github.com/TanStack/ai/pull/463))

  Both types previously declared `url?` and `b64Json?` as independently optional, which allowed meaningless `{}` values and objects that set both fields. They now require exactly one:

  ```ts
  type GeneratedMediaSource =
    | { url: string; b64Json?: never }
    | { b64Json: string; url?: never }
  ```

  Existing read patterns like `img.url || \`data:image/png;base64,${img.b64Json}\``continue to work unchanged. The only runtime-visible change is that the`@tanstack/ai-openrouter`and`@tanstack/ai-fal`image adapters no longer populate`url`with a synthesized`data:image/png;base64,...`URI when the provider returns base64 — they return`{ b64Json }`only. Consumers that want a data URI should build it from`b64Json` at render time.

### Patch Changes

- refactor(ai, ai-openai): narrow error handling before logging ([#465](https://github.com/TanStack/ai/pull/465))

  `catch (error: any)` sites in `stream-to-response.ts`, `activities/stream-generation-result.ts`, and `activities/generateVideo/index.ts` are now narrowed to `unknown` and funnel through a shared `toRunErrorPayload(error, fallback)` helper that extracts `message` / `code` without leaking the original error object (which can carry request state from an SDK).

  Replaced four `console.error` calls in the OpenAI text adapter's `chatStream` catch block that dumped the full error object to stdout. SDK errors can carry the original request including auth headers, so the library now logs only the narrowed `{ message, code }` payload via the internal logger — any user-supplied logger receives the sanitized shape, not the raw SDK error.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.8

## 0.13.0

### Minor Changes

- **Pluggable debug logging across every activity.** `chat`, `summarize`, `generateImage`, `generateVideo`, `generateSpeech`, and `generateTranscription` now accept a `debug?: DebugOption` that turns on structured per-category logs (`request`, `provider`, `output`, `middleware`, `tools`, `agentLoop`, `config`, `errors`). ([#467](https://github.com/TanStack/ai/pull/467))

  ```ts
  chat({ adapter, messages, debug: true }) // all categories on
  chat({ adapter, messages, debug: false }) // silent (incl. errors)
  chat({ adapter, messages, debug: { middleware: false } }) // all except middleware
  chat({ adapter, messages, debug: { logger: pino } }) // route to a custom logger
  ```

  Additions:
  - New `Logger` interface (`debug` / `info` / `warn` / `error`) and default `ConsoleLogger` that routes to matching `console.*` methods and prints nested `meta` via `console.dir(meta, { depth: null, colors: true })` so streamed provider payloads render in full.
  - New `DebugCategories` / `DebugConfig` / `DebugOption` public types.
  - New internal `@tanstack/ai/adapter-internals` subpath export exposing `InternalLogger` + `resolveDebugOption` so provider adapters can thread logging without leaking internals on the public surface.
  - Each log line is prefixed with an emoji + `[tanstack-ai:<category>]` tag so categories are visually distinguishable in dense streams. Errors log unconditionally unless explicitly silenced.
  - `TextEngine`, `MiddlewareRunner`, and every activity entry point thread a resolved `InternalLogger` through the pipeline — no globals, concurrent calls stay independent.
  - Exceptions thrown by a user-supplied `Logger` implementation are swallowed so they never mask the real error that triggered the log call.
  - New `ai-core/debug-logging` skill shipped under `packages/typescript/ai/skills/` so agents can discover how to toggle, narrow, and redirect debug output.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.7

## 0.12.0

### Minor Changes

- Add `ProviderTool<TProvider, TKind>` phantom-branded tool subtype and a `toolCapabilities` channel on `TextAdapter['~types']`. `TextActivityOptions['tools']` is now typed so that adapter-exported provider tools are gated against the selected model's `supports.tools` list. User tools from `toolDefinition()` remain unaffected. ([#466](https://github.com/TanStack/ai/pull/466))

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.6

## 0.11.1

### Patch Changes

- fix(ai): make optional nested objects and arrays nullable under `forStructuredOutput`. Previously `makeStructuredOutputCompatible` recursed into optional composites and skipped the `'null'`-wrap, but still added them to `required[]`, producing a schema that OpenAI-style strict `json_schema` providers reject. Any schema with an optional `z.object({...}).optional()` or `z.array(...).optional()` field now serializes as `type: ['object','null']` / `['array','null']` and passes strict validation. ([#484](https://github.com/TanStack/ai/pull/484))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.5

## 0.11.0

### Minor Changes

- **AG-UI core interop — spec-compliant event types.** `StreamChunk` now re-uses `@ag-ui/core`'s `EventType` enum and event shapes directly. Practical changes: ([#474](https://github.com/TanStack/ai/pull/474))
  - `RunErrorEvent` is flat (`{ message, code }` at the top level) instead of nested under `error: {...}`.
  - `TOOL_CALL_START` / `TOOL_CALL_END` events expose `toolCallName` (the deprecated `toolName` alias is retained as a passthrough for now).
  - Adapters now emit `REASONING_*` events (`REASONING_START`, `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, `REASONING_END`) alongside the legacy `STEP_*` events; consumers rendering thinking content should migrate to the `REASONING_*` channel.
  - `TOOL_CALL_RESULT` events are emitted after tool execution in the agent loop.
  - New `stripToSpecMiddleware` (always injected last) removes non-spec fields (`model`, `content`, `args`, `finishReason`, `usage`, `toolName`, `stepId`, …) from events before they reach consumers. Internal state management sees the full un-stripped chunks.
  - `ChatOptions` gained optional `threadId` and `runId` for AG-UI run correlation; they flow through to `RUN_STARTED` / `RUN_FINISHED`.
  - `StateDeltaEvent.delta` is now a JSON Patch `any[]` per the AG-UI spec.

### Patch Changes

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai-event-client@0.2.4

## 0.10.3

### Patch Changes

- fix(ai, ai-openai, ai-gemini, ai-ollama): normalize null tool input to empty object ([#430](https://github.com/TanStack/ai/pull/430))

  When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI/Gemini/Ollama adapter `TOOL_CALL_END` emissions. The Anthropic adapter already had this fix.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.3

## 0.10.2

### Patch Changes

- Emit TOOL_CALL_START and TOOL_CALL_ARGS for pending tool calls during continuation re-executions ([#372](https://github.com/TanStack/ai/pull/372))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.2

## 0.10.1

### Patch Changes

- Add @tanstack/intent agent skills for AI coding assistants ([#432](https://github.com/TanStack/ai/pull/432))

  Adds 10 skill files covering chat-experience, tool-calling, media-generation,
  code-mode, structured-outputs, adapter-configuration, ag-ui-protocol,
  middleware, and custom-backend-integration. Skills guide AI agents to generate
  correct TanStack AI code patterns and avoid common mistakes.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.1

## 0.10.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-event-client@0.2.0

## 0.9.2

### Patch Changes

- fix: handle errors from fal result fetch on completed jobs ([#396](https://github.com/TanStack/ai/pull/396))

  fal.ai does not return a FAILED queue status — invalid jobs report COMPLETED, and the real error (e.g. 422 validation) only surfaces when fetching results. `getVideoUrl()` now catches these errors and extracts detailed validation messages. `getVideoJobStatus()` returns `status: 'failed'` when the result fetch throws on a "completed" job.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.4

## 0.9.1

### Patch Changes

- Fix Gemini adapter tool call handling: preserve thoughtSignature for Gemini 3+ thinking models through the tool call lifecycle, use correct function name (instead of call ID) in functionResponse parts, and include the call ID in both functionCall and functionResponse for proper correlation. ([#401](https://github.com/TanStack/ai/pull/401))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.3

## 0.9.0

### Minor Changes

- feat: Add lazy tool discovery for `chat()` ([#360](https://github.com/TanStack/ai/pull/360))

  Tools marked with `lazy: true` are not sent to the LLM upfront. Instead, a synthetic discovery tool lets the LLM selectively discover lazy tools by name, receiving their descriptions and schemas on demand. Discovered tools are dynamically injected as normal tools. This reduces token usage and improves response quality when applications have many tools.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.2

## 0.8.1

### Patch Changes

- Add an explicit subscription lifecycle to `ChatClient` with `subscribe()`/`unsubscribe()`, `isSubscribed`, `connectionStatus`, and `sessionGenerating`, while keeping request lifecycle state separate from long-lived connection state for durable chat sessions. ([#356](https://github.com/TanStack/ai/pull/356))

  Update the React, Preact, Solid, Svelte, and Vue chat bindings with `live` mode plus reactive subscription/session state, and improve `StreamProcessor` handling for concurrent runs and reconnects so active sessions do not finalize early or duplicate resumed assistant messages.

- Add durable `subscribe()`/`send()` transport support to `ChatClient` while preserving compatibility with existing `connect()` adapters. This also introduces shared generation clients for one-shot streaming tasks and updates the framework wrappers to use the new generation transport APIs. ([#286](https://github.com/TanStack/ai/pull/286))

  Improve core stream processing to better handle concurrent runs and resumed streams so shared sessions stay consistent during reconnects and overlapping generations.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.1

## 0.8.0

### Minor Changes

- feat: add middleware system and content guard middleware ([#367](https://github.com/TanStack/ai/pull/367))
  - **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
  - **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
  - **@tanstack/ai-client**: Updated event types for middleware integration.
  - **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai-event-client@0.1.0

## 0.7.0

### Minor Changes

- feat: add realtime voice chat with OpenAI and ElevenLabs adapters ([#300](https://github.com/TanStack/ai/pull/300))

  Adds realtime voice/text chat capabilities:
  - **@tanstack/ai**: `realtimeToken()` function and shared realtime types (`RealtimeToken`, `RealtimeMessage`, `RealtimeSessionConfig`, `RealtimeStatus`, `RealtimeMode`, `AudioVisualization`, events, and error types)
  - **@tanstack/ai-client**: Framework-agnostic `RealtimeClient` class with connection lifecycle, audio I/O, message state management, tool execution, and `RealtimeAdapter`/`RealtimeConnection` interfaces
  - **@tanstack/ai-openai**: `openaiRealtime()` client adapter (WebRTC) and `openaiRealtimeToken()` server token adapter with support for semantic VAD, multiple voices, and all realtime models
  - **@tanstack/ai-elevenlabs**: `elevenlabsRealtime()` client adapter (WebSocket) and `elevenlabsRealtimeToken()` server token adapter for ElevenLabs conversational AI agents
  - **@tanstack/ai-react**: `useRealtimeChat()` hook with reactive state for status, mode, messages, pending transcripts, audio visualization levels, VAD control, text/image input, and interruptions
  - **Docs**: Realtime Voice Chat guide and full API reference for all realtime classes, interfaces, functions, and type aliases

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.0.2

## 0.6.3

### Patch Changes

- feat: pass abort signal to generation fetchers and extract GenerationFetcher utility type ([#327](https://github.com/TanStack/ai/pull/327))
  - Generation clients now forward an `AbortSignal` to fetcher functions via an optional `options` parameter, enabling cancellation support when `stop()` is called
  - Introduced `GenerationFetcher<TInput, TResult>` utility type in `@tanstack/ai-client` to centralize the fetcher function signature across all framework integrations
  - All framework hooks/composables (React, Solid, Vue, Svelte) now use the shared `GenerationFetcher` type instead of inline definitions

## 0.6.2

### Patch Changes

- Fix tool approval flow: output priority over approval metadata, preserve approval/output fields in updateToolCallPart, batch-gate execution until all approvals are resolved ([#352](https://github.com/TanStack/ai/pull/352))

## 0.6.1

### Patch Changes

- Fix chat stall when server and client tools are called in the same turn. ([#323](https://github.com/TanStack/ai/pull/323))

  When the LLM requested both a server tool and a client tool in the same response, the server tool's result was silently dropped. The `processToolCalls` and `checkForPendingToolCalls` methods returned early to wait for the client tool, skipping the `emitToolResults` call entirely — so the server result was never emitted or added to the message history, causing the session to stall indefinitely.

  The fix emits completed server tool results before yielding the early return for client tool / approval waiting.

  Also fixes the smoke-test harness and test fixtures to use `chunk.value` instead of `chunk.data` for CUSTOM events, following the rename introduced in #307.

## 0.6.0

### Minor Changes

- feat: add custom event dispatch support for tools ([#293](https://github.com/TanStack/ai/pull/293))

  Tools can now emit custom events during execution via `dispatchEvent()`. Custom events are streamed to clients as `custom_event` stream chunks and surfaced through the client chat hook's `onCustomEvent` callback. This enables tools to send progress updates, intermediate results, or any structured data back to the UI during long-running operations.

### Patch Changes

- Refactor CustomEvent property from 'data' to 'value' for AG-UI compliance ([#307](https://github.com/TanStack/ai/pull/307))

## 0.5.1

### Patch Changes

- Fix CI ([#295](https://github.com/TanStack/ai/pull/295))

## 0.5.0

### Minor Changes

- Tighten the AG-UI adapter contract and simplify the core stream processor. ([#275](https://github.com/TanStack/ai/pull/275))

  **Breaking type changes:**
  - `TextMessageContentEvent.delta` is now required (was optional)
  - `StepFinishedEvent.delta` is now required (was optional)

  All first-party adapters already sent `delta` on every event, so this is a type-level enforcement of existing behavior. Community adapters that follow the reference implementations will not need code changes.

  **Core processor simplifications:**
  - `TEXT_MESSAGE_START` now resets text segment state, replacing heuristic overlap detection
  - `TOOL_CALL_END` is now the authoritative signal for tool call input completion
  - Removed delta/content fallback logic, whitespace-only message cleanup, and finish-reason conflict arbitration from the processor

  **Adapter fixes:**
  - Gemini: filter whitespace-only text parts, fix STEP_FINISHED content accumulation, emit fresh TEXT_MESSAGE_START after tool calls
  - Anthropic: emit fresh TEXT_MESSAGE_START after tool_use blocks for proper text segmentation

### Patch Changes

- fix(ai, ai-client, ai-anthropic, ai-gemini): fix multi-turn conversations failing after tool calls ([#275](https://github.com/TanStack/ai/pull/275))

  **Core (@tanstack/ai):**
  - Lazy assistant message creation: `StreamProcessor` now defers creating the assistant message until the first content-bearing chunk arrives (text, tool call, thinking, or error), eliminating empty `parts: []` messages from appearing during auto-continuation when the model returns no content
  - Add `prepareAssistantMessage()` (lazy) alongside deprecated `startAssistantMessage()` (eager, backwards-compatible)
  - Add `getCurrentAssistantMessageId()` to check if a message was created
  - **Rewrite `uiMessageToModelMessages()` to preserve part ordering**: the function now walks parts sequentially instead of separating by type, producing correctly interleaved assistant/tool messages (text1 + toolCall1 → toolResult1 → text2 + toolCall2 → toolResult2) instead of concatenating all text and batching all tool calls. This fixes multi-round tool flows where the model would see garbled conversation history and re-call tools unnecessarily.
  - Deduplicate tool result messages: when a client tool has both a `tool-result` part and a `tool-call` part with `output`, only one `role: 'tool'` message is emitted per tool call ID

  **Client (@tanstack/ai-client):**
  - Update `ChatClient.processStream()` to use lazy assistant message creation, preventing UI flicker from empty messages being created then removed

  **Anthropic:**
  - Fix consecutive user-role messages violating Anthropic's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `tool_result` blocks with the same `tool_use_id`
  - Filter out empty assistant messages from conversation history
  - Suppress duplicate `RUN_FINISHED` event from `message_stop` when `message_delta` already emitted one
  - Fix `TEXT_MESSAGE_END` incorrectly emitting for `tool_use` content blocks
  - Add Claude Opus 4.6 model support with adaptive thinking and effort parameter

  **Gemini:**
  - Fix consecutive user-role messages violating Gemini's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `functionResponse` parts with the same name (tool call ID)
  - Filter out empty model messages from conversation history

## 0.4.2

### Patch Changes

- fix issue with delta ([#272](https://github.com/TanStack/ai/pull/272))

## 0.4.1

### Patch Changes

- fix for tool calls ([#266](https://github.com/TanStack/ai/pull/266))

## 0.4.0

### Minor Changes

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

## 0.3.1

### Patch Changes

- fix: improve tool execution reliability and prevent race conditions ([#258](https://github.com/TanStack/ai/pull/258))
  - Fix client tool execution race conditions by tracking pending tool executions
  - Prevent duplicate continuation attempts with continuationPending flag
  - Guard against concurrent stream processing in streamResponse
  - Add approval info to ToolCall type for server-side decision tracking
  - Include approval info in model message conversion for approval workflows
  - Check ModelMessage format for approval info extraction in chat activity

  This change improves the reliability of tool execution, especially for:
  - Client tools with async execute functions
  - Approval-based tool workflows
  - Sequential tool execution scenarios

## 0.3.0

### Minor Changes

- feat: Add AG-UI protocol events to streaming system ([#244](https://github.com/TanStack/ai/pull/244))

  All text adapters now emit AG-UI protocol events only:
  - `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
  - `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
  - `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

  Only AG-UI event types are supported; previous legacy chunk formats (`content`, `tool_call`, `done`, etc.) are no longer accepted.

## 0.2.2

### Patch Changes

- fixed an issue with gemini and thought chunks processing ([#210](https://github.com/TanStack/ai/pull/210))

## 0.2.1

### Patch Changes

- Fix up model names for OpenAI and release the new response APIs ([#188](https://github.com/TanStack/ai/pull/188))

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

## 0.2.0

### Minor Changes

- Standard schema / standard json schema support for TanStack AI ([#165](https://github.com/TanStack/ai/pull/165))

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

## 0.0.3

### Patch Changes

- update event client ([#128](https://github.com/TanStack/ai/pull/128))

## 0.0.2

### Patch Changes

- added text metadata support for message inputs ([#95](https://github.com/TanStack/ai/pull/95))

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))
