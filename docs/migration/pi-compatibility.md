---
title: pi bridge compatibility
id: pi-compatibility
order: 8
description: 'What crosses between TanStack AI and pi agent events in @tanstack/ai-pi-stream: what works as is, what is mapped to another shape, and what is dropped.'
keywords:
  - tanstack ai
  - pi
  - pi-agent-core
  - AgentEvent
  - ag-ui
  - compatibility
  - migration
---

Use these tables to see what `@tanstack/ai-pi-stream` does with each feature, event and message. The guides are [TanStack useChat with a pi agent](./pi-agent-tanstack-client) and [pi UI with a TanStack AI server](./pi-client-tanstack-server).

> [!WARNING]
> The bridge connects two different event formats. The rows marked ❌ **Dropped** are features that one side does not have. Check them before you depend on the bridge.

Each row has one of these results:

| Result         | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| ✅ **Same**    | It arrives with the same meaning and data.                         |
| 🔄 **Mapped**  | It arrives as a different shape that carries the same data.        |
| 🧩 **Grouped** | It is joined with other items into one item, or is split from one. |
| ❌ **Dropped** | It does not cross.                                                 |

## 📋 Features

| Feature                                   | TanStack client, pi agent                                                 | pi client, TanStack server                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Text                                      | ✅ Same                                                                   | ✅ Same                                                                       |
| Reasoning and its signature               | ✅ Same                                                                   | ✅ Same                                                                       |
| Redacted reasoning                        | 🔄 Mapped in the history. The stream sends the signature only.            | 🔄 Mapped in the history. The stream drops it.                                |
| Gemini `thoughtSignature` on a tool call  | 🔄 Mapped to tool-call `metadata` and back                                | 🔄 Mapped to `thoughtSignature` on the pi tool call                           |
| Agent and server tools                    | ✅ Same                                                                   | 🔄 Mapped to `tool_execution_start` and `tool_execution_end` at the result    |
| Tool errors                               | 🔄 Mapped to the `output-error` state                                     | 🔄 Mapped to `isError: true`                                                  |
| Partial tool results                      | ❌ Dropped (AG-UI has no partial tool result)                             | ❌ Dropped (`chat()` sends none)                                              |
| Client tools                              | ❌ Dropped (pi runs every tool in the agent)                              | ❌ Dropped. The pi turn stops at the call, with no result.                    |
| Tool approvals                            | ❌ Dropped (pi blocks a call in `beforeToolCall`, and sends no event)     | ❌ Dropped (pi has no approval event)                                         |
| Model calls                               | 🧩 Grouped. Each pi assistant message is one assistant message.           | 🧩 Grouped. Each model call is one pi turn.                                   |
| Model, response id and token usage        | 🔄 Mapped to `RUN_FINISHED`                                               | 🔄 Mapped to the pi assistant message                                         |
| Token cost                                | ❌ Dropped (AG-UI has no cost)                                            | ❌ Dropped. The pi cost is zero.                                              |
| Errors and aborts                         | 🔄 Mapped to `RUN_ERROR`                                                  | 🔄 Mapped to an assistant message with `stopReason: 'error'`                  |
| Text and base64 images from the user      | ✅ Same                                                                   | ✅ Same                                                                       |
| Image URLs, audio, video and documents    | ❌ Dropped (pi user messages take text and base64 images)                 | ❌ Dropped (pi user messages take text and base64 images)                     |
| System prompts                            | 🔄 Mapped to the leading pi system message                                | 🧩 Grouped. Every pi system message becomes one of the `systemPrompts`. From a client request, set them on the server instead. |
| Steering and follow-up messages of pi     | ❌ Dropped from the stream (AG-UI has no user message event)              | ❌ Dropped (`chat()` has none)                                                |
| Custom pi messages (`CustomAgentMessages`) | ❌ Dropped                                                               | ❌ Dropped                                                                    |
| Steps, state, activity and custom events  | ❌ Dropped (pi has none)                                                  | ❌ Dropped (pi has none)                                                      |
| Subagents                                 | ❌ Dropped (pi has none)                                                  | ❌ Dropped (pi has none)                                                      |
| Structured output                         | ❌ Dropped (pi has none)                                                  | ✅ Same (the JSON is text)                                                    |

## 🥧 TanStack client, pi agent

### ⬇️ Reply: pi events to TanStack events

| pi agent event                                          | AG-UI event from `fromPiAgentEvents`                                  | Result                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `agent_start`                                           | `RUN_STARTED` with the `threadId` and `runId` you pass                | 🔄 Mapped                                               |
| `message_start` of an assistant message                 | A new message id for the events that follow                           | 🔄 Mapped                                               |
| `text_start` / `text_delta` / `text_end`                | `TEXT_MESSAGE_START` / `CONTENT` / `END`                              | ✅ Same                                                 |
| `thinking_start` / `thinking_delta` / `thinking_end`    | `REASONING_MESSAGE_START` / `CONTENT` / `END`                         | ✅ Same                                                 |
| `thinkingSignature` on the final message                | `REASONING_ENCRYPTED_VALUE`, message                                  | 🔄 Mapped                                               |
| `toolcall_start` / `toolcall_delta`                     | `TOOL_CALL_START` / `ARGS`                                            | ✅ Same                                                 |
| `toolcall_end`                                          | `TOOL_CALL_END` with the parsed input                                 | ✅ Same                                                 |
| `thoughtSignature` on the final message                 | `REASONING_ENCRYPTED_VALUE`, tool call                                | 🔄 Mapped                                               |
| `message_end` of an assistant message                   | `RUN_FINISHED` with the finish reason, model, response id and usage   | 🔄 Mapped                                               |
| `message_end` with `stopReason` `error` or `aborted`    | `RUN_ERROR` with the error message                                    | 🔄 Mapped                                               |
| `message_end` of a `toolResult` message                 | `TOOL_CALL_RESULT`, with the `output-error` state when `isError`      | 🔄 Mapped                                               |
| `agent_end`                                             | `RUN_FINISHED`, only when no assistant message ended                  | 🔄 Mapped                                               |
| `turn_start`, `turn_end`, `tool_execution_start`, `end` |                                                                       | ❌ Dropped (the messages carry the same data)           |
| `tool_execution_update`                                 |                                                                       | ❌ Dropped                                              |
| `message_start` / `end` of a user or system message     |                                                                       | ❌ Dropped                                              |

### ⬆️ Request: TanStack messages to pi messages

| TanStack message                                 | pi message                                                  | Result                                          |
| ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `systemPrompts`                                  | One leading `system` message                                | 🧩 Grouped                                      |
| `user` with text and data images                 | `user` with `text` and `image` content                      | ✅ Same                                         |
| `user` image URLs, audio, video and documents    |                                                             | ❌ Dropped                                      |
| `assistant` thinking, text and tool calls        | `assistant` with `thinking`, `text` and `toolCall` content  | 🔄 Mapped. The text comes after the thinking.   |
| `assistant` thinking signature, redacted flag    | `thinkingSignature`, `redacted`                             | ✅ Same                                         |
| Tool call `metadata.thoughtSignature`            | `thoughtSignature` on the `toolCall`                        | 🔄 Mapped                                       |
| `tool`                                           | `toolResult` with the tool name of its call                 | 🔄 Mapped                                       |
| `tool` with `error`                              | `toolResult` with `isError: true`                           | 🔄 Mapped                                       |
| The model that wrote an assistant message        | `api`, `provider`, `model` from the `model` option          | 🔄 Mapped. Without the option, they are empty.  |

## 🌴 pi client, TanStack server

### ⬇️ Reply: chat() events to pi events

| AG-UI event from `chat()`                         | pi agent event from `toPiAgentEvents`                                         | Result                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `RUN_STARTED`                                     | `agent_start`. The adapter provider and model go on the assistant messages.   | 🔄 Mapped                                              |
| First content of a model call                     | `turn_start`, then `message_start` of an assistant message                    | 🔄 Mapped                                              |
| `TEXT_MESSAGE_START` / `CONTENT` / `END`          | `text_start` / `text_delta` / `text_end`                                      | ✅ Same                                                |
| `REASONING_MESSAGE_START` / `CONTENT` / `END`     | `thinking_start` / `thinking_delta` / `thinking_end`                          | ✅ Same                                                |
| `REASONING_ENCRYPTED_VALUE`, message              | `thinkingSignature` on the thinking content                                   | 🔄 Mapped                                              |
| `REASONING_ENCRYPTED_VALUE`, tool call            | `thoughtSignature` on the tool call                                           | 🔄 Mapped                                              |
| `TOOL_CALL_START` / `ARGS` / `END`                | `toolcall_start` / `toolcall_delta` / `toolcall_end`                          | ✅ Same                                                |
| `RUN_FINISHED` of a model call                    | `message_end` with the stop reason, usage and response id                     | 🔄 Mapped                                              |
| `TOOL_CALL_RESULT`                                | `tool_execution_start`, `tool_execution_end`, then a `toolResult` message     | 🔄 Mapped                                              |
| The next model call, or the end of the stream     | `turn_end` with the assistant message and its tool results                    | 🔄 Mapped                                              |
| `RUN_ERROR`                                       | `message_end` with `stopReason: 'error'`, `turn_end`, then `agent_end`        | 🔄 Mapped                                              |
| The end of the stream                             | `agent_end` with the new messages of the run                                  | 🔄 Mapped. The prompt messages are not in the list.    |
| `STEP_*`, `STATE_*`, `ACTIVITY_*`, `CUSTOM`       |                                                                               | ❌ Dropped                                             |
| Subagent events                                   |                                                                               | ❌ Dropped                                             |
| `RUN_FINISHED` with an interrupt outcome          | `message_end` with `stopReason: 'toolUse'`                                    | ❌ Dropped. The interrupt does not cross.              |

### ⬆️ Request: pi messages to chat() messages

| pi message                                         | TanStack message                                     | Result                                       |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `system`                                           | One entry of `systemPrompts`                         | 🔄 Mapped                                    |
| `user` with `text` and `image` content             | `user` with text and data image parts                | ✅ Same                                      |
| `assistant` text                                   | `assistant` content                                  | 🧩 Grouped. The text blocks join.            |
| `assistant` thinking, signature, redacted flag     | `thinking`                                           | ✅ Same                                      |
| `assistant` tool calls                             | `toolCalls` with the arguments as JSON               | 🔄 Mapped                                    |
| `thoughtSignature` on a tool call                  | Tool call `metadata.thoughtSignature`                | 🔄 Mapped                                    |
| `toolResult`                                       | `tool` with the text content                         | 🔄 Mapped. Images in a tool result are dropped. |
| `toolResult` with `isError: true`                  | `tool` with `error`                                  | 🔄 Mapped                                    |
| Usage, stop reason, model of an assistant message  |                                                      | ❌ Dropped (`chat()` does not read them)     |
| Custom pi messages                                 |                                                      | ❌ Dropped                                   |
