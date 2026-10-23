---
title: AI SDK bridge compatibility
id: ai-sdk-compatibility
order: 5
description: "What crosses between TanStack AI and the Vercel AI SDK UI message stream in @tanstack/ai-ui-message-stream: what works as is, what is mapped to another shape, and what is dropped."
keywords:
  - tanstack ai
  - vercel ai sdk
  - ui message stream
  - ag-ui
  - compatibility
  - migration
---

Use these tables to see what `@tanstack/ai-ui-message-stream` does with each feature, event and message part. The guides are [AI SDK useChat with a TanStack AI server](./ai-sdk-client-tanstack-server) and [TanStack useChat with an AI SDK server](./tanstack-client-ai-sdk-server).

> [!WARNING]
> The bridge is a stop gap while you port one side of an app. The rows marked **Dropped** and **One way** are why. Finish the port with the [migration guide](./migration-from-vercel-ai), then remove the bridge.

Each row has one of these results:

| Result | Meaning |
| --- | --- |
| **Same** | It arrives with the same meaning and data. |
| **Mapped** | It arrives as a different shape that carries the same data. |
| **Grouped** | It is joined with other items into one item, or is split from one. |
| **One way** | It crosses in one direction only. |
| **Dropped** | It does not cross. |

## Features

| Feature | AI SDK client, TanStack server | TanStack client, AI SDK server |
| --- | --- | --- |
| Text | Same | Same |
| Reasoning | Same. The signature goes back to the provider on the next turn. | Same. The provider metadata goes back to the route unchanged. |
| Server tools | Same | Same |
| Client tools | Same | Same. Pass the tools to `useChat`. |
| Tool approvals | Mapped to `tool-approval-request` and back to `resume` | Mapped to a `tool-approval` interrupt. Pass the tools to `fromChatTransport` too. |
| Tool errors and denials | Same | Same |
| Files and images from the user | Mapped to content parts | Mapped to file parts |
| Activity | Mapped to a `data-<activityType>` part | Mapped from a `data-<name>` part with an `id` |
| Subagents | Grouped into one `data-subagent` card per child | Dropped (the AI SDK has no subagents) |
| Shared state | One way, to a `data-state` part | Dropped (the AI SDK has no state) |
| Custom events | Mapped to a transient `data-<name>` chunk | Mapped from a transient `data-<name>` chunk |
| Stream resume | Same, with a durability log | Same. A reload needs `threadId` on `fromChatTransport`. |
| Sources and generated files | Dropped (`chat()` sends none) | Dropped |
| Finish reason | Mapped | Mapped. A `tool-calls` finish is dropped (see below). |
| Token usage | Dropped | Dropped (the AI SDK stream has none) |

## AI SDK client, TanStack server

### Reply: `chat()` events to AI SDK chunks

| AG-UI event from `chat()` | AI SDK chunk | Result |
| --- | --- | --- |
| `TEXT_MESSAGE_START` / `CONTENT` / `END` | `text-start` / `text-delta` / `text-end` | Same. The first one also sends `start` with the message id. |
| `REASONING_MESSAGE_START` / `CONTENT` / `END` | `reasoning-start` / `reasoning-delta` / `reasoning-end` | Same |
| `REASONING_ENCRYPTED_VALUE` | `providerMetadata.tanstack.signature` on `reasoning-end` | Mapped. Redacted thinking adds `redacted: true`. |
| `TOOL_CALL_START` / `ARGS` | `tool-input-start` / `tool-input-delta` | Same |
| `TOOL_CALL_END` | `tool-input-available` with the parsed input | Mapped |
| `TOOL_CALL_RESULT` | `tool-output-available` | Same. JSON output is parsed. |
| `TOOL_CALL_RESULT` with an error | `tool-output-error` | Mapped |
| `TOOL_CALL_RESULT` that the user denied | `tool-output-denied` | Mapped |
| `RUN_FINISHED` with an approval interrupt | `tool-approval-request`, then `message-metadata` with `tanstack.runId` | Mapped |
| `RUN_FINISHED` with a client tool interrupt | Nothing. The AI SDK client runs a call that has no output. | Mapped |
| `RUN_FINISHED` | `finish` with the finish reason | Mapped |
| `RUN_ERROR` | `error` | Mapped |
| `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` | `data-<activityType>` with the activity id and the full content | Mapped. A delta is applied, then the full content is sent. |
| `STATE_SNAPSHOT` / `STATE_DELTA` | `data-state` with id `state` and the full state | One way |
| `SUBAGENT_STARTED` / `FINISHED` / `ERROR`, and child text | `data-subagent` with id `subagentRunId` | Grouped. One card holds the name, status, text and error. |
| Child tool calls, reasoning and activity | | Dropped. The card shows the child text only. |
| Approval inside a subagent | `interruptIds` on the subagent card | Grouped |
| `CUSTOM` | Transient `data-<name>` | Mapped. It reaches `onData`, not the message. |
| `RUN_STARTED`, `STEP_STARTED`, `STEP_FINISHED`, `MESSAGES_SNAPSHOT`, `RAW` | | Dropped |
| `*_CHUNK` shorthand events | | Dropped. `chat()` does not send them. |

### Request: AI SDK message parts to `chat()` messages

| AI SDK part | TanStack part | Result |
| --- | --- | --- |
| `text` | `text` | Same |
| `reasoning` | `thinking` with the signature | Same |
| `file` | `image`, `audio`, `video` or `document`, by media type | Mapped. A data URL becomes a data source. |
| `tool-<name>` / `dynamic-tool` with output | `tool-call` plus `tool-result` | Grouped. The result follows its call. |
| Tool part with `output-error` / `output-denied` | `tool-call` plus an error `tool-result` | Grouped |
| Tool part with `approval-responded` | Pending `tool-call`, plus a `resume` item `{ approved }` | Mapped |
| The `reason` of an approval answer | | Dropped. `resume` has no field for it. |
| `system` message | | Dropped. `chat()` reads system prompts from `systemPrompts`. |
| `source-url`, `source-document`, `data-*`, `step-start`, `custom`, `reasoning-file` | | Dropped |
| Message `metadata` | | Dropped. Only `tanstack.runId` is read, as `parentRunId`. |

## TanStack client, AI SDK server

### Reply: AI SDK chunks to TanStack events

| AI SDK chunk | AG-UI event | Result |
| --- | --- | --- |
| `start` | `RUN_STARTED` | Mapped. The message id is the AG-UI message id. |
| `text-start` / `text-delta` / `text-end` | `TEXT_MESSAGE_START` / `CONTENT` / `END` | Grouped. All text parts go into one assistant message. |
| `reasoning-start` / `reasoning-delta` / `reasoning-end` | `REASONING_MESSAGE_*` | Same. Each reasoning part gets its own id. |
| `providerMetadata` on `reasoning-end` | `REASONING_ENCRYPTED_VALUE` | Mapped. It goes back to the route unchanged. |
| `tool-input-start` / `tool-input-delta` | `TOOL_CALL_START` / `TOOL_CALL_ARGS` | Same |
| `tool-input-available` | `TOOL_CALL_END` | Same. It sends `TOOL_CALL_START` and `TOOL_CALL_ARGS` first if they did not come. |
| `tool-input-error` | `TOOL_CALL_END` plus an error `TOOL_CALL_RESULT` | Mapped |
| `tool-output-available` | `TOOL_CALL_RESULT` | Same |
| `tool-output-available` with `preliminary: true` | | Dropped. Only the final output is sent. |
| `tool-output-error` / `tool-output-denied` | Error `TOOL_CALL_RESULT` | Mapped |
| `tool-approval-request` | Approval interrupt on `RUN_FINISHED` | Mapped. Without `tools`, it is a generic interrupt: resolve it with `{ approved }`. |
| `finish` | `RUN_FINISHED` with the finish reason | Mapped |
| `finish` with `tool-calls` | `RUN_FINISHED` with no finish reason | Mapped. In TanStack, `tool_calls` means more steps follow in the same stream. |
| `error` | `RUN_ERROR` | Mapped |
| `abort` | `RUN_FINISHED` with a `cancelled` outcome | Mapped |
| `data-<name>` with an `id` and object data | `ACTIVITY_SNAPSHOT` of type `<name>` | Mapped. The same id replaces the activity. |
| Other `data-<name>` (transient, no `id`, or not an object) | `CUSTOM` named `data-<name>` | Mapped |
| `start-step`, `finish-step`, `reset-step` | | Dropped |
| `source-url`, `source-document`, `file`, `reasoning-file`, `custom` | | Dropped |
| `message-metadata`, `messageMetadata` on `start` and `finish` | | Dropped |
| `tool-approval-response` | | Dropped |

### Request: TanStack messages to AI SDK message parts

| TanStack part | AI SDK part | Result |
| --- | --- | --- |
| `text` | `text` | Same |
| `thinking` | `reasoning` with the stored provider metadata | Same |
| `image`, `audio`, `video`, `document` | `file` | Mapped. A data source becomes a data URL. |
| `tool-call` plus its `tool-result` | One `dynamic-tool` part | Grouped |
| `tool-call` with an approval answer | `dynamic-tool` with `approval-responded` | Mapped |
| `tool-call` that waits for approval | `dynamic-tool` with `approval-requested` | Mapped |
| `activity` messages | | Dropped |
| `structured-output`, `subagent`, `ui-resource` | | Dropped |
