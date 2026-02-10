# @tanstack/ai

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
