# @tanstack/ai

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
