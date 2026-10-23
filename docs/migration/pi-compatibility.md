---
title: pi bridge compatibility
id: pi-compatibility
order: 8
description: 'What crosses between TanStack AI and pi agent events in @tanstack/ai-pi-stream: what works as is, what is mapped to another shape, and what is dropped because one side has no place for it.'
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

Each row has one of these results:

| Result         | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| ✅ **Same**    | It arrives with the same meaning and data.                         |
| 🔄 **Mapped**  | It arrives as a different shape that carries the same data.        |
| 🧩 **Grouped** | It is joined with other items into one item, or is split from one. |
| ❌ **Dropped** | It does not cross. The row says which side has no place for it.    |
| ➖ **Not sent** | Nothing is lost. The same data crosses in another row.             |

## 🚫 What does not cross, and why

Everything else crosses. These do not, because one side has no place for them.

pi has no place for:

- **Image URLs, audio, video and documents from the user.** A pi user message holds text and base64 images only. The bridge does not download files to fill that gap.
- **Structured output from a pi agent.** pi has no structured output, so a pi answer is text.
- **Subagents from a pi agent.** pi has no subagents.
- **Images in a `chat()` tool result for a URL or file.** A pi tool result holds text and base64 images only.

TanStack AI and AG-UI have no place for:

- **The cost breakdown of pi.** TanStack usage has one `cost` total, so the input, output and cache costs of pi join into it.
- **pi model fields on a history message.** `chat()` messages do not keep the usage, stop reason and model of each pi assistant message.

## 📋 Features

| Feature                                   | TanStack client, pi agent                                                           | pi client, TanStack server                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Text                                      | ✅ Same                                                                             | ✅ Same                                                                                     |
| Reasoning and its signature               | ✅ Same                                                                             | ✅ Same                                                                                     |
| Redacted reasoning                        | 🔄 Mapped to the `redacted_thinking-` reasoning id and back                         | 🔄 Mapped to `redacted: true` on the pi thinking content                                    |
| Gemini `thoughtSignature` on a tool call  | 🔄 Mapped to tool-call `metadata` and back                                          | 🔄 Mapped to `thoughtSignature` on the pi tool call                                         |
| Agent and server tools                    | ✅ Same                                                                             | 🔄 Mapped to `tool_execution_start` and `tool_execution_end` at the result                  |
| Tool errors                               | 🔄 Mapped to the `output-error` state                                               | 🔄 Mapped to `isError: true`                                                                |
| Images in tool results                    | 🔄 Mapped to image content parts                                                    | 🔄 Mapped to pi image content. URL and file images are ❌ Dropped (pi has no place).        |
| Partial tool results                      | 🔄 Mapped to a `pi.tool-progress` custom event                                      | 🔄 Mapped to a `tanstack-event` message (a tool's custom events)                            |
| Tool approvals                            | 🔄 Mapped to an approval interrupt with `runPiAgent({ needsApproval })`             | 🔄 Mapped to a `tanstack-interrupt` message. Answer with `resume`.                          |
| Client tools                              | 🔄 Mapped to a client tool interrupt with `runPiAgent`                              | 🔄 Mapped to a `toolUse` stop. The pi client runs the tool and sends the result.            |
| Model calls                               | 🧩 Grouped. Each pi assistant message is one assistant message.                     | 🧩 Grouped. Each model call is one pi turn.                                                 |
| Model, response id and token usage        | 🔄 Mapped to `RUN_FINISHED`                                                         | 🔄 Mapped to the pi assistant message                                                       |
| Token cost                                | 🧩 Grouped into the TanStack usage `cost`. The breakdown is ❌ Dropped (AG-UI limit). | 🔄 Mapped to the pi cost total                                                              |
| Errors and aborts                         | 🔄 Mapped to `RUN_ERROR`                                                            | 🔄 Mapped to an assistant message with `stopReason: 'error'`                                |
| Text and base64 images from the user      | ✅ Same                                                                             | ✅ Same                                                                                     |
| Image URLs, audio, video and documents    | ❌ Dropped (pi has no place: text and base64 images only)                           | ❌ Dropped (pi has no place: text and base64 images only)                                   |
| System prompts                            | 🔄 Mapped to the leading pi system message, from the server                         | 🧩 Grouped into `systemPrompts`. From a client request, the server sets them instead.       |
| Steering and follow-up messages of pi     | 🔄 Mapped to a `pi.message` custom event                                            | ✅ Same (they are user messages in the history)                                             |
| Custom pi messages (`CustomAgentMessages`) | 🔄 Mapped to a `pi.message` custom event                                           | ❌ Dropped from the history (TanStack AI has no place for app messages)                     |
| Steps, state, activity and custom events  | ➖ pi has none to send                                                              | 🔄 Mapped to `tanstack-event` messages                                                      |
| Subagents                                 | ❌ Dropped (pi has no subagents)                                                    | 🔄 Mapped to `tanstack-event` messages with the subagent events                             |
| Structured output                         | ❌ Dropped (pi has no structured output)                                            | ✅ Same (the JSON is text)                                                                  |

## 🥧 TanStack client, pi agent

### ⬇️ Reply: pi events to TanStack events

| pi agent event                                          | AG-UI event from `fromPiAgentEvents`                                    | Result                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `agent_start`                                           | `RUN_STARTED` with the `threadId` and `runId` you pass                  | 🔄 Mapped                                     |
| `message_start` of an assistant message                 | A new message id for the events that follow                             | 🔄 Mapped                                     |
| `text_start` / `text_delta` / `text_end`                | `TEXT_MESSAGE_START` / `CONTENT` / `END`                                | ✅ Same                                       |
| `thinking_start` / `thinking_delta` / `thinking_end`    | `REASONING_MESSAGE_START` / `CONTENT` / `END`                           | ✅ Same                                       |
| Redacted thinking content                               | A reasoning message id with the `redacted_thinking-` prefix             | 🔄 Mapped                                     |
| `thinkingSignature` on the final message                | `REASONING_ENCRYPTED_VALUE`, message                                    | 🔄 Mapped                                     |
| `toolcall_start` / `toolcall_delta`                     | `TOOL_CALL_START` / `ARGS`                                              | ✅ Same                                       |
| `toolcall_end`                                          | `TOOL_CALL_END` with the parsed input                                   | ✅ Same                                       |
| `thoughtSignature` on the final message                 | `REASONING_ENCRYPTED_VALUE`, tool call                                  | 🔄 Mapped                                     |
| `tool_execution_update`                                 | `CUSTOM` named `pi.tool-progress`                                       | 🔄 Mapped                                     |
| `message_end` of a `toolResult` message                 | `TOOL_CALL_RESULT`, with the `output-error` state when `isError`        | 🔄 Mapped                                     |
| Image content in a tool result                          | `TOOL_CALL_RESULT` with the JSON content parts                          | 🔄 Mapped                                     |
| A tool call that `runPiAgent` paused                    | No `TOOL_CALL_RESULT`, and an interrupt on the `RUN_FINISHED`           | 🔄 Mapped                                     |
| `message_end` of an assistant message                   | `RUN_FINISHED` with the finish reason, model, response id and usage     | 🔄 Mapped. A tool-use message ends at `turn_end`. |
| The pi cost total                                       | `metadata.tanstack.usage.cost` on `RUN_FINISHED`                        | 🔄 Mapped                                     |
| `message_end` with `stopReason` `error` or `aborted`    | `RUN_ERROR` with the error message                                      | 🔄 Mapped                                     |
| `message_end` of a user, system or app message mid-run  | `CUSTOM` named `pi.message`                                             | 🔄 Mapped                                     |
| `message_end` of the prompt                             |                                                                         | ➖ Not sent. The client sent it.              |
| `agent_end`                                             | `RUN_FINISHED`, only when no assistant message ended                    | 🔄 Mapped                                     |
| `turn_start`, `tool_execution_start`, `end`             |                                                                         | ➖ Not sent. The messages carry the same data. |

### ⬆️ Request: TanStack messages to pi messages

| TanStack message or request field             | pi message                                                   | Result                                          |
| --------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `systemPrompts` of `runPiAgent`               | One leading `system` message                                 | 🧩 Grouped                                      |
| `user` with text and data images              | `user` with `text` and `image` content                       | ✅ Same                                         |
| `user` image URLs, audio, video and documents |                                                              | ❌ Dropped (pi has no place for them)           |
| `assistant` thinking, text and tool calls     | `assistant` with `thinking`, `text` and `toolCall` content   | 🔄 Mapped. The text comes after the thinking.   |
| `assistant` thinking signature, redacted flag | `thinkingSignature`, `redacted`                              | ✅ Same                                         |
| Tool call `metadata.thoughtSignature`         | `thoughtSignature` on the `toolCall`                         | 🔄 Mapped                                       |
| `tool`, with text or image parts              | `toolResult` with the tool name of its call                  | 🔄 Mapped                                       |
| `tool` with `error`                           | `toolResult` with `isError: true`                            | 🔄 Mapped                                       |
| Client tools of the request                   | pi tools with their JSON Schema, which pause the run         | 🔄 Mapped                                       |
| `resume`, approved                            | The pi tool runs, and its `toolResult` continues the loop    | 🔄 Mapped                                       |
| `resume`, denied                              | A `toolResult` with `isError: true` and the `denied` outcome | 🔄 Mapped                                       |
| `resume`, client tool output                  | A `toolResult` with the output                               | 🔄 Mapped                                       |
| The model that wrote an assistant message     | `api`, `provider`, `model` from the pi model                 | 🔄 Mapped                                       |

## 🌴 pi client, TanStack server

### ⬇️ Reply: chat() events to pi events

| AG-UI event from `chat()`                         | pi agent event from `toPiAgentEvents`                                         | Result                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `RUN_STARTED`                                     | `agent_start`. The adapter provider and model go on the assistant messages.   | 🔄 Mapped                                           |
| First content of a model call                     | `turn_start`, then `message_start` of an assistant message                    | 🔄 Mapped                                           |
| `TEXT_MESSAGE_START` / `CONTENT` / `END`          | `text_start` / `text_delta` / `text_end`                                      | ✅ Same                                             |
| `REASONING_MESSAGE_START` / `CONTENT` / `END`     | `thinking_start` / `thinking_delta` / `thinking_end`                          | ✅ Same                                             |
| A `redacted_thinking-` reasoning message          | Thinking content with `redacted: true`                                        | 🔄 Mapped                                           |
| `REASONING_ENCRYPTED_VALUE`, message              | `thinkingSignature` on the thinking content                                   | 🔄 Mapped                                           |
| `REASONING_ENCRYPTED_VALUE`, tool call            | `thoughtSignature` on the tool call                                           | 🔄 Mapped                                           |
| `TOOL_CALL_START` / `ARGS` / `END`                | `toolcall_start` / `toolcall_delta` / `toolcall_end`                          | ✅ Same                                             |
| `RUN_FINISHED` of a model call                    | `message_end` with the stop reason, usage, cost and response id               | 🔄 Mapped                                           |
| `RUN_FINISHED` with an interrupt outcome          | A `tanstack-interrupt` message with the run id and the interrupts             | 🔄 Mapped                                           |
| `TOOL_CALL_RESULT`                                | `tool_execution_start`, `tool_execution_end`, then a `toolResult` message     | 🔄 Mapped                                           |
| `TOOL_CALL_RESULT` with text and image parts      | pi `text` and `image` content                                                 | 🔄 Mapped                                           |
| The next model call, or the end of the stream     | `turn_end` with the assistant message and its tool results                    | 🔄 Mapped                                           |
| `RUN_ERROR`                                       | `message_end` with `stopReason: 'error'`, `turn_end`, then `agent_end`        | 🔄 Mapped                                           |
| The end of the stream                             | `agent_end` with the new messages of the run                                  | 🔄 Mapped. The prompt messages are not in the list. |
| `STEP_*`, `STATE_*`, `ACTIVITY_*`, `CUSTOM`       | A `tanstack-event` message with the event                                     | 🔄 Mapped                                           |
| Subagent events                                   | A `tanstack-event` message with the event                                     | 🔄 Mapped                                           |
| `REASONING_START` / `END`                         |                                                                               | ➖ Not sent. The reasoning messages carry the data. |

### ⬆️ Request: pi messages to chat() messages

| pi message or request field                        | TanStack message or `chat()` param                   | Result                                                             |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `system`, from `chatParamsFromPiRequest`           |                                                      | ❌ Dropped on purpose. The server sets `systemPrompts`.            |
| `system`, from `fromPiMessages`                    | One entry of `systemPrompts`                         | 🔄 Mapped. Use it only for a history the server owns.              |
| `user` with `text` and `image` content             | `user` with text and data image parts                | ✅ Same                                                            |
| `assistant` text                                   | `assistant` content                                  | 🧩 Grouped. The text blocks join.                                  |
| `assistant` thinking, signature, redacted flag     | `thinking`                                           | ✅ Same                                                            |
| `assistant` tool calls                             | `toolCalls` with the arguments as JSON               | 🔄 Mapped                                                          |
| `thoughtSignature` on a tool call                  | Tool call `metadata.thoughtSignature`                | 🔄 Mapped                                                          |
| `toolResult`, with text and image content          | `tool` with text, or text and image parts            | 🔄 Mapped                                                          |
| `toolResult` with `isError: true`                  | `tool` with `error`                                  | 🔄 Mapped                                                          |
| `tools` (pi tools of the client)                   | Client tools of `chat()`                             | 🔄 Mapped                                                          |
| `resume` and `parentRunId`                         | `resume` and `parentRunId` of `chat()`               | ✅ Same                                                            |
| `tanstack-interrupt` and `tanstack-event` messages |                                                      | ➖ Not sent. The run id of the last interrupt fills `parentRunId`. |
| Usage, stop reason, model of an assistant message  |                                                      | ❌ Dropped (TanStack history messages have no place for them)      |
| Custom pi messages                                 |                                                      | ❌ Dropped (TanStack AI has no place for app messages)             |
