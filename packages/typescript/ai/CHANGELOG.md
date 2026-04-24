# @tanstack/ai

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
