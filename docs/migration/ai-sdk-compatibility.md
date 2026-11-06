---
title: AI SDK bridge compatibility
id: ai-sdk-compatibility
order: 5
description: 'What crosses between TanStack AI and the Vercel AI SDK UI message stream in @tanstack/ai-ui-message-stream: what works as is, what is mapped to another shape, and what is dropped.'
keywords:
  - tanstack ai
  - vercel ai sdk
  - ui message stream
  - ag-ui
  - compatibility
  - migration
---

Use these tables to see what `@tanstack/ai-ui-message-stream` does with each feature, event and message part. The guides are [AI SDK useChat with a TanStack AI server](./ai-sdk-client-tanstack-server) and [TanStack useChat with an AI SDK server](./tanstack-client-ai-sdk-server). The column for an AI SDK client also covers `toChatTransport`, which runs the same conversion in the browser.

> [!WARNING]
> The bridge is a stop gap while you port one side of an app. The rows marked ❌ **Dropped** and ➡️ **One way** are why. Finish the port with the [migration guide](./migration-from-vercel-ai), then remove the bridge.

Each row has one of these results:

| Result         | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| ✅ **Same**    | It arrives with the same meaning and data.                         |
| 🔄 **Mapped**  | It arrives as a different shape that carries the same data.        |
| 🧩 **Grouped** | It is joined with other items into one item, or is split from one. |
| ➡️ **One way** | It crosses in one direction only.                                  |
| ❌ **Dropped** | It does not cross.                                                 |

## 📋 Features

| Feature                                                              | AI SDK client, TanStack server                            | TanStack client, AI SDK server                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Text                                                                 | ✅ Same                                                   | ✅ Same                                                                                            |
| Reasoning and its signature                                          | ✅ Same                                                   | ✅ Same                                                                                            |
| Tool-call provider data (Gemini `thoughtSignature`, OpenAI item ids) | 🔄 Mapped to `callProviderMetadata` and back              | 🔄 Mapped to tool-call `metadata` and back                                                         |
| Server tools                                                         | ✅ Same                                                   | ✅ Same                                                                                            |
| Provider-executed tools (web search)                                 | 🔄 Mapped to `providerExecuted`                           | 🔄 Mapped to the TanStack provider-executed flag                                                   |
| Client tools                                                         | ✅ Same                                                   | 🔄 Mapped. Their schemas go to the route in the body. Read them with `clientToolsFromAISDKBody`.   |
| Tool approvals                                                       | 🔄 Mapped to `tool-approval-request` and back to `resume` | 🔄 Mapped to a `tool-approval` interrupt. The approval `signature` goes back to the route.         |
| Tool errors and denials                                              | ✅ Same                                                   | ✅ Same                                                                                            |
| Steps of a tool loop                                                 | 🔄 Mapped to `start-step` / `finish-step`                 | 🔄 Mapped to `STEP_*` events, and to `step-start` parts in the history                             |
| Files and images from the user                                       | 🔄 Mapped to content parts                                | 🔄 Mapped to file parts                                                                            |
| Web search sources                                                   | 🔄 Mapped to `source-url` chunks                          | 🔄 Mapped to custom events                                                                         |
| Model, response ids and token usage                                  | 🔄 Mapped to message metadata under `tanstack`            | ❌ Dropped (the AI SDK stream has none)                                                            |
| Message metadata of the app                                          | ✅ Same                                                   | 🔄 Mapped to `metadata.aiSdk` and back                                                             |
| Activity                                                             | 🔄 Mapped to a `data-<activityType>` part                 | 🔄 Mapped from a `data-<name>` part with an `id` and object data                                   |
| Subagents                                                            | 🧩 Grouped into one `data-subagent` card per child        | ❌ Dropped (the AI SDK has no subagents)                                                           |
| Shared state                                                         | ➡️ One way, to a `data-state` part                        | ❌ Dropped (the AI SDK has no state)                                                               |
| Structured output                                                    | ✅ Same (the JSON is text)                                | 🔄 Mapped to a typed `structured-output` part with `outputSchema`, and back to text in the history |
| Custom events                                                        | 🔄 Mapped to a transient `data-<name>` chunk              | 🔄 Mapped from a transient `data-<name>` chunk                                                     |
| Stream resume                                                        | ✅ Same, with a durability log                            | ✅ Same. A reload needs `threadId` on `fromChatTransport`.                                         |
| System messages                                                      | ❌ Dropped. The server owns its system prompts.           | ❌ Dropped. `streamText` rejects them.                                                             |
| Generated files                                                      | ❌ Dropped (`chat()` sends none)                          | 🔄 Mapped to custom events                                                                         |

## ▲ AI SDK client, TanStack server

### ⬇️ Reply: `chat()` events to AI SDK chunks

| AG-UI event from `chat()`                                                | AI SDK chunk                                                             | Result                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `RUN_STARTED`                                                            |                                                                          | ❌ Dropped. A `start` with no message id goes before the first part, so the AI SDK client keeps its own message id. |
| `TEXT_MESSAGE_START` / `CONTENT` / `END`                                 | `text-start` / `text-delta` / `text-end`                                 | ✅ Same                                                                                                             |
| `REASONING_MESSAGE_START` / `CONTENT` / `END`                            | `reasoning-start` / `reasoning-delta` / `reasoning-end`                  | ✅ Same                                                                                                             |
| `REASONING_ENCRYPTED_VALUE`, message                                     | `providerMetadata.tanstack.signature` on `reasoning-end`                 | 🔄 Mapped. Redacted thinking adds `redacted: true`.                                                                 |
| `REASONING_ENCRYPTED_VALUE`, tool call                                   | `thoughtSignature` in the tool call's `providerMetadata.tanstack`        | 🔄 Mapped                                                                                                           |
| `TOOL_CALL_START` / `ARGS`                                               | `tool-input-start` / `tool-input-delta`                                  | ✅ Same                                                                                                             |
| `TOOL_CALL_START.metadata`                                               | `providerMetadata.tanstack` on the tool chunks (`callProviderMetadata`)  | 🔄 Mapped                                                                                                           |
| `TOOL_CALL_END`                                                          | `tool-input-available` with the parsed input                             | 🔄 Mapped. Arguments that are not JSON become `tool-input-error`.                                                   |
| Provider-executed call                                                   | `providerExecuted: true`, and a `tool-output-available` with its sources | 🔄 Mapped                                                                                                           |
| Sources of a provider-executed call                                      | `source-url`                                                             | 🔄 Mapped                                                                                                           |
| `TOOL_CALL_RESULT`                                                       | `tool-output-available`                                                  | ✅ Same. JSON output is parsed.                                                                                     |
| `TOOL_CALL_RESULT` with an error                                         | `tool-output-error`                                                      | 🔄 Mapped                                                                                                           |
| `TOOL_CALL_RESULT` that the user denied                                  | `tool-output-denied`                                                     | 🔄 Mapped                                                                                                           |
| A new model call in the run                                              | `start-step`, and `finish-step` at its end                               | 🔄 Mapped                                                                                                           |
| `RUN_FINISHED` metadata (model, `responseId`, `responseItems`, `source`) | `message-metadata` under `tanstack`                                      | 🔄 Mapped                                                                                                           |
| `RUN_FINISHED.usage`                                                     | `message-metadata` as `tanstack.tokenUsage`, one entry per model call    | 🔄 Mapped                                                                                                           |
| `RUN_FINISHED` with an approval interrupt                                | `tool-approval-request`, and `tanstack.runId` in the message metadata    | 🔄 Mapped                                                                                                           |
| `RUN_FINISHED` with a client tool interrupt                              | Nothing. The AI SDK client runs a call that has no output.               | 🔄 Mapped                                                                                                           |
| `RUN_FINISHED`                                                           | `finish` with the finish reason                                          | 🔄 Mapped                                                                                                           |
| `RUN_ERROR`                                                              | `error`                                                                  | 🔄 Mapped                                                                                                           |
| An error thrown by `chat()`                                              | `error` with the error message                                           | 🔄 Mapped                                                                                                           |
| `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA`                                   | `data-<activityType>` with the activity id and the full content          | 🔄 Mapped. A delta is applied, then the full content is sent.                                                       |
| `STATE_SNAPSHOT` / `STATE_DELTA`                                         | `data-state` with id `state` and the full state                          | ➡️ One way                                                                                                          |
| `SUBAGENT_*` events and child text                                       | `data-subagent` with id `subagentRunId`                                  | 🧩 Grouped. One card holds the name, status, text and error.                                                        |
| Child tool calls, reasoning and activity                                 |                                                                          | ❌ Dropped. The card shows the child text only.                                                                     |
| Approval inside a subagent                                               | `interruptIds` on the subagent card                                      | 🧩 Grouped                                                                                                          |
| `CUSTOM`                                                                 | Transient `data-<name>`                                                  | 🔄 Mapped. It reaches `onData`, not the message.                                                                    |
| `MESSAGES_SNAPSHOT`, `RAW`                                               |                                                                          | ❌ Dropped                                                                                                          |
| `STEP_*` and `*_CHUNK` shorthand events                                  |                                                                          | ❌ Dropped. `chat()` does not send them.                                                                            |

### ⬆️ Request: AI SDK message parts to `chat()` messages

| AI SDK part                                                                         | TanStack part                                            | Result                                                                                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `text`                                                                              | `text`                                                   | ✅ Same                                                                                   |
| `reasoning`                                                                         | `thinking` with the signature                            | ✅ Same                                                                                   |
| `file`                                                                              | `image`, `audio`, `video` or `document`, by media type   | 🔄 Mapped. A base64 data URL becomes a data source.                                       |
| `tool-<name>` / `dynamic-tool` with output                                          | `tool-call` plus `tool-result`                           | 🧩 Grouped. The result follows its call.                                                  |
| `callProviderMetadata.tanstack`                                                     | `tool-call` `metadata`                                   | 🔄 Mapped                                                                                 |
| Tool part with `providerExecuted`                                                   | `tool-call` with no `tool-result`                        | 🔄 Mapped. `chat()` does not run it again.                                                |
| Tool part with `output-error` / `output-denied`                                     | `tool-call` plus an error `tool-result`                  | 🧩 Grouped                                                                                |
| Tool part with `approval-responded`                                                 | Pending `tool-call`, plus a `resume` item `{ approved }` | 🔄 Mapped. The message needs `tanstack.runId` in its metadata, else the request is a 400. |
| The `reason` of an approval answer                                                  |                                                          | ❌ Dropped. `resume` has no field for it.                                                 |
| Message `metadata`                                                                  | `metadata`                                               | ✅ Same. With more than one step, `tanstack.responseItems` is removed.                    |
| `system` message                                                                    |                                                          | ❌ Dropped. Pass `systemPrompts` to `chat()` on the server.                               |
| `source-url`, `source-document`, `data-*`, `step-start`, `custom`, `reasoning-file` |                                                          | ❌ Dropped                                                                                |

## 🌴 TanStack client, AI SDK server

### ⬇️ Reply: AI SDK chunks to TanStack events

| AI SDK chunk                                                                           | AG-UI event                                                                                    | Result                                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `start`                                                                                | `RUN_STARTED`                                                                                  | 🔄 Mapped. The message id is the AG-UI message id.                                     |
| `messageMetadata` on `start`, `message-metadata`, `finish`                             | `metadata.aiSdk` on the message, at the end of the run                                         | 🔄 Mapped                                                                              |
| `start-step` / `finish-step`                                                           | `STEP_STARTED` / `STEP_FINISHED`                                                               | ✅ Same                                                                                |
| `reset-step`                                                                           |                                                                                                | ❌ Dropped                                                                             |
| `text-start` / `text-delta` / `text-end`                                               | `TEXT_MESSAGE_START` / `CONTENT` / `END`                                                       | 🧩 Grouped. All text parts go into one assistant message.                              |
| Text of an `Output.object` answer, with `outputSchema`                                 | `structured-output.start`, the text, then `structured-output.complete` with the checked object | 🔄 Mapped. A schema failure ends the run with `RUN_ERROR`.                             |
| `providerMetadata` on text chunks                                                      |                                                                                                | ❌ Dropped. TanStack keeps no metadata per text part.                                  |
| `text-end.citations`                                                                   | `CUSTOM` named `citations`                                                                     | 🔄 Mapped                                                                              |
| `reasoning-start` / `reasoning-delta` / `reasoning-end`                                | `REASONING_MESSAGE_*`                                                                          | ✅ Same. Each reasoning part gets its own id.                                          |
| `providerMetadata` on `reasoning-end`                                                  | `REASONING_ENCRYPTED_VALUE`                                                                    | 🔄 Mapped. It goes back to the route unchanged.                                        |
| `tool-input-start` / `tool-input-delta`                                                | `TOOL_CALL_START` / `TOOL_CALL_ARGS`                                                           | ✅ Same                                                                                |
| `providerMetadata` on tool input chunks                                                | tool-call `metadata.aiSdk.callProviderMetadata`                                                | 🔄 Mapped                                                                              |
| `providerExecuted`                                                                     | tool-call `metadata.providerExecuted`                                                          | 🔄 Mapped. The client does not run the call.                                           |
| `inputEncoding: 'text'`                                                                | One `TOOL_CALL_ARGS` with the final input                                                      | 🔄 Mapped                                                                              |
| `tool-input-available`                                                                 | `TOOL_CALL_END`, after any approval or output for the same call                                | ✅ Same                                                                                |
| `tool-input-error`                                                                     | `TOOL_CALL_END` plus an error `TOOL_CALL_RESULT`                                               | 🔄 Mapped                                                                              |
| `tool-output-available`                                                                | `TOOL_CALL_RESULT`                                                                             | ✅ Same                                                                                |
| `providerMetadata` on tool output chunks                                               | tool-call `metadata.aiSdk.resultProviderMetadata`                                              | 🔄 Mapped when it comes right after the call. Later, it is dropped.                    |
| `tool-output-available` with `preliminary: true`                                       |                                                                                                | ❌ Dropped. Only the final output is sent.                                             |
| `tool-output-error` / `tool-output-denied`                                             | Error `TOOL_CALL_RESULT`                                                                       | 🔄 Mapped                                                                              |
| `tool-approval-request`                                                                | Approval interrupt on `RUN_FINISHED`                                                           | 🔄 Mapped. Without `tools`, it is a generic interrupt: resolve it with `{ approved }`. |
| `signature`, `approvalDescriptor`, `inputSchemaInput`, `reason` of an approval request | tool-call `metadata.aiSdk.approval`                                                            | 🔄 Mapped                                                                              |
| `tool-approval-request` with `isAutomatic`                                             |                                                                                                | ❌ Dropped. The route already decided, and the output or denial follows.               |
| `tool-approval-response`                                                               |                                                                                                | ❌ Dropped                                                                             |
| `finish`                                                                               | `RUN_FINISHED` with the finish reason                                                          | 🔄 Mapped                                                                              |
| `finish` with `tool-calls`                                                             | `RUN_FINISHED` with no finish reason                                                           | 🔄 Mapped. In TanStack, `tool_calls` means more steps follow in the same stream.       |
| `error`                                                                                | `RUN_ERROR`                                                                                    | 🔄 Mapped                                                                              |
| `abort`                                                                                | `RUN_FINISHED` with a `cancelled` outcome                                                      | 🔄 Mapped                                                                              |
| The stream ends before `finish`, `error` or `abort`                                    | With `fromChatTransport`, a reconnect                                                          | 🔄 Mapped. With nothing to resume, the run finishes with what came.                    |
| `data-<name>` with an `id` and object data                                             | `ACTIVITY_SNAPSHOT` of type `<name>`                                                           | 🔄 Mapped. The same type and id replace it. The activity id is `data-<name>:<id>`.     |
| Other `data-<name>` (transient, no `id`, or not an object)                             | `CUSTOM` named `data-<name>`                                                                   | 🔄 Mapped                                                                              |
| `source-url`, `source-document`, `file`, `reasoning-file`                              | `CUSTOM` with the same name                                                                    | 🔄 Mapped                                                                              |
| `custom`                                                                               |                                                                                                | ❌ Dropped                                                                             |

### ⬆️ Request: TanStack messages to AI SDK message parts

| TanStack part                               | AI SDK part                                                          | Result                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `text`                                      | `text`                                                               | ✅ Same                                                                      |
| `thinking`                                  | `reasoning` with the stored provider metadata                        | ✅ Same                                                                      |
| `image`, `audio`, `video`, `document`       | `file`                                                               | 🔄 Mapped. A data source becomes a data URL.                                 |
| `tool-call` plus its `tool-result`          | One `dynamic-tool` part                                              | 🧩 Grouped                                                                   |
| tool-call `metadata.aiSdk`                  | `callProviderMetadata`, `resultProviderMetadata`                     | 🔄 Mapped                                                                    |
| Provider-executed `tool-call`               | `dynamic-tool` with `providerExecuted: true`                         | 🔄 Mapped                                                                    |
| `tool-call` with an approval answer         | `dynamic-tool` with `approval-responded`, and the stored `signature` | 🔄 Mapped                                                                    |
| `tool-call` that waits for approval         | `dynamic-tool` with `approval-requested`                             | 🔄 Mapped                                                                    |
| Client tool declarations of the run         | `clientTools` in the request body                                    | 🔄 Mapped                                                                    |
| A tool result followed by more of the reply | `step-start` before the next step                                    | 🔄 Mapped                                                                    |
| `structured-output`, complete               | `text` with the JSON                                                 | 🔄 Mapped                                                                    |
| Message `metadata.aiSdk`                    | Message `metadata`                                                   | 🔄 Mapped                                                                    |
| `system` messages                           |                                                                      | ❌ Dropped. `streamText` rejects them unless `allowSystemInMessages` is set. |
| `activity` messages                         |                                                                      | ❌ Dropped                                                                   |
| `subagent`, `ui-resource`                   |                                                                      | ❌ Dropped                                                                   |
