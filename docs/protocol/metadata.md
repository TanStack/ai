---
title: Event metadata
id: protocol-event-metadata
order: 1
description: "What a custom AG-UI server must put in metadata.tanstack so TanStack ChatClient and useChat get finishReason, model, and leftover usage."
keywords:
  - tanstack ai
  - ag-ui protocol
  - metadata.tanstack
  - finishReason
  - custom server
  - SSE
---

Your server speaks AG-UI. TanStack `useChat` still misses `finishReason`, the model id, or leftover usage. Put those extras in `metadata.tanstack` on the event. Spec fields stay at the top.

Copy this `RUN_FINISHED` event first:

```json
{
  "type": "RUN_FINISHED",
  "threadId": "thread-1",
  "runId": "run-1",
  "usage": [
    {
      "inputTokens": 12,
      "outputTokens": 34,
      "totalTokens": 46
    }
  ],
  "metadata": {
    "tanstack": {
      "finishReason": "stop",
      "model": "gpt-5.5"
    }
  }
}
```

The client copies `metadata.tanstack` onto the chunk. After `chunk.type === "RUN_FINISHED"`, read `chunk.metadata?.tanstack?.finishReason`. In-process `usage` is TanStack `TokenUsage` (`promptTokens`). The wire uses the spec array (`inputTokens`).

## Do now

Send these on every successful run:

| Field | Where | Why the client needs it |
| --- | --- | --- |
| `type`, `threadId`, `runId` | Spec top level | Frame the run. Missing ids break resume and correlation. |
| `usage[]` | Spec top level on `RUN_FINISHED` / `RUN_ERROR` | Token counts. Use `inputTokens`, `outputTokens`, `totalTokens`. |
| `finishReason` | `metadata.tanstack` on `RUN_FINISHED` | After a tool result, the client continues only when this is not `"stop"`. |
| `model` | `metadata.tanstack` | SSE `[DONE]` fallback and generation reconstruct. |

`finishReason` is one of `"stop"`, `"length"`, `"content_filter"`, `"tool_calls"`, or `null`.

If you omit `finishReason` after a tool result, the client treats it as not `"stop"` and can send another turn.

## Read it on the client

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onChunk: (chunk) => {
    if (chunk.type === "RUN_FINISHED") {
      console.log(chunk.usage);
      console.log(chunk.metadata?.tanstack?.finishReason);
      console.log(chunk.metadata?.tanstack?.model);
    }
  },
});
```

Do not import a helper. Check `chunk.type`, then read `chunk.metadata?.tanstack`.

## `RUN_ERROR`

AG-UI `RUN_ERROR` has `message` and optional `code` at the top. Put correlation ids in `metadata.tanstack`:

```json
{
  "type": "RUN_ERROR",
  "message": "Provider timeout",
  "code": "TIMEOUT",
  "metadata": {
    "tanstack": {
      "threadId": "thread-1",
      "runId": "run-1",
      "model": "gpt-5.5"
    }
  }
}
```

## Later

Add these when you use the matching feature:

- **Leftover usage.** Spec `usage[]` also accepts `cachedInputTokens` and `reasoningTokens`. Put `cost` and other leftover fields in `metadata.tanstack.usage`. The client rebuilds TanStack `TokenUsage` (`promptTokens`) from the array plus that leftover.
- **Interrupt errors.** On `RUN_ERROR`, set `metadata.tanstack.interruptErrors` so `ChatClient` can match a failed interrupt submit.
- **Tool output error.** On `TOOL_CALL_RESULT`, set `metadata.tanstack.state` to `"output-error"` when the tool result is an error payload.
- **Message stamps.** On wire messages, `metadata.tanstack.createdAt` is an ISO-8601 string.
- **Signatures.** Stream thinking signatures on `REASONING_ENCRYPTED_VALUE`. On the next-turn body, set spec `encryptedValue` on `role: "reasoning"` messages and on `toolCalls`. Other tool-call provider fields stay in `metadata.tanstack.toolCallMetadata`. See [Thinking & Reasoning](../chat/thinking-content).

A TanStack `chat()` server already writes this bag. Use this page when you emit AG-UI events yourself.

See [Stream Events](../chat/stream-events) for the event table, and [AG-UI Client Compliance](../migration/ag-ui-compliance) for the request body.
