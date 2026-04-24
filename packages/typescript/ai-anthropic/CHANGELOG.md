# @tanstack/ai-anthropic

## 0.8.1

### Patch Changes

- Wire each adapter's text, summarize, image, speech, transcription, and video paths through the new `InternalLogger` from `@tanstack/ai/adapter-internals`: `logger.request(...)` before each SDK call, `logger.provider(...)` for every chunk received, and `logger.errors(...)` in catch blocks. Migrates all pre-existing ad-hoc `console.*` calls in adapter catch blocks (including the OpenAI and ElevenLabs realtime adapters) onto the structured logger. No adapter factory or config-shape changes. ([#467](https://github.com/TanStack/ai/pull/467))

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0

## 0.8.0

### Minor Changes

- Expose provider-tool factories (`webSearchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, `webFetchTool`, `memoryTool`, `customTool`) on a new `/tools` subpath. Each factory now returns a branded type (e.g. `AnthropicWebSearchTool`) that is gated against the selected model's `supports.tools` list. Existing factory signatures and runtime behavior are unchanged; old config-type aliases (`WebSearchTool`, `BashTool`, etc.) remain as `@deprecated` aliases pointing at the renamed `*ToolConfig` types. ([#466](https://github.com/TanStack/ai/pull/466))

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0

## 0.7.5

### Patch Changes

- Align stream output with `@tanstack/ai`'s AG-UI-compliant event shapes: emit `REASONING_*` events alongside `STEP_*`, thread `threadId`/`runId` through `RUN_STARTED`/`RUN_FINISHED`, and return flat `RunErrorEvent` shape. Cast raw events through an internal `asChunk` helper so they line up with the re-exported `@ag-ui/core` `EventType` enum. No changes to adapter factory signatures or config shapes. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai@0.11.0

## 0.7.4

### Patch Changes

- Update model metadata from OpenRouter API ([#451](https://github.com/TanStack/ai/pull/451))

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3

## 0.7.3

### Patch Changes

- Update model metadata from OpenRouter API ([#433](https://github.com/TanStack/ai/pull/433))

## 0.7.2

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0

## 0.7.0

### Minor Changes

- Add `claude-sonnet-4-6` model metadata to the Anthropic adapter, including 1M native context window and adaptive thinking support. ([#378](https://github.com/TanStack/ai/pull/378))

### Patch Changes

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1

## 0.6.2

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0

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

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0

## 0.4.2

### Patch Changes

- Add in opus 4.6 and enhance acceptable config options by providers ([#278](https://github.com/TanStack/ai/pull/278))

## 0.4.1

### Patch Changes

- fix for tool calls ([#266](https://github.com/TanStack/ai/pull/266))

- Updated dependencies [[`6e1bb50`](https://github.com/TanStack/ai/commit/6e1bb5097178a6ad795273ca715f1e09d3f5a006)]:
  - @tanstack/ai@0.4.1

## 0.4.0

### Patch Changes

- re-release adapter packages ([#263](https://github.com/TanStack/ai/pull/263))

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai@0.4.0

## 0.3.0

### Minor Changes

- feat: Add AG-UI protocol events to streaming system ([#244](https://github.com/TanStack/ai/pull/244))

  All text adapters now emit AG-UI protocol events only:
  - `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
  - `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
  - `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

  Only AG-UI event types are supported; previous legacy chunk formats (`content`, `tool_call`, `done`, etc.) are no longer accepted.

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai@0.3.0

## 0.2.0

### Minor Changes

- Standard schema / standard json schema support for TanStack AI ([#165](https://github.com/TanStack/ai/pull/165))

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3

## 0.0.2

### Patch Changes

- added text metadata support for message inputs ([#95](https://github.com/TanStack/ai/pull/95))

- Updated dependencies [[`64fda55`](https://github.com/TanStack/ai/commit/64fda55f839062bc67b8c24850123e879fdbf0b3)]:
  - @tanstack/ai@0.0.2

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai@0.0.1
