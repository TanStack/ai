---
title: Event metadata
id: protocol-event-metadata
order: 1
description: "Which fields a custom AG-UI server puts in metadata.tanstack, so that TanStack useChat gets the finish reason, the model, and extra usage."
keywords:
  - tanstack ai
  - ag-ui protocol
  - metadata.tanstack
  - finishReason
  - custom server
  - SSE
---

TanStack AI puts the finish reason and the model id in AG-UI metadata. `useChat` reads those fields from there.

Put these extras in `metadata.tanstack` on the event. The spec fields stay at the top level.

> [!NOTE]
> A TanStack `chat()` server already writes `metadata.tanstack`. If your server sends AG-UI events itself, use this page.

## Quick setup

### 1. Send a complete `RUN_FINISHED` event

Copy this event. Change the ids, the counts, and the model:

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
      "model": "gpt-6.1-sol"
    }
  }
}
```

### 2. Read the fields on the client

Check `chunk.type`, then read `chunk.metadata?.tanstack`. You do not need a helper:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const { messages } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    onChunk: (chunk) => {
      if (chunk.type === "RUN_FINISHED") {
        console.log(chunk.usage);
        console.log(chunk.metadata?.tanstack?.finishReason);
        console.log(chunk.metadata?.tanstack?.model);
      }
    },
  });

  return <pre>{JSON.stringify(messages, null, 2)}</pre>;
}
```

Send a message. The console now shows the token usage, `"stop"`, and the model id.

## How it works

The client copies `metadata.tanstack` from the wire event onto the chunk. Spec fields such as `usage` stay where the spec puts them.

Send these fields on every successful run:

| Field | Where | Why the client needs it |
| --- | --- | --- |
| `type`, `threadId`, `runId` | Spec top level | They frame the run. Without the ids, resume and correlation break. |
| `usage[]` | Spec top level on `RUN_FINISHED` and `RUN_ERROR` | Token counts: `inputTokens`, `outputTokens`, `totalTokens`. |
| `finishReason` | `metadata.tanstack` on `RUN_FINISHED` | After a tool result, the client continues only when this is not `"stop"`. |
| `model` | `metadata.tanstack` | Generation reconstruct uses it. |

`finishReason` is one of these values: `"stop"`, `"length"`, `"content_filter"`, `"tool_calls"`, or `null`.

> [!WARNING]
> Always send `finishReason` after a tool result. If it is missing, the client treats it as not `"stop"` and can send another turn.

For the full event list, see [Stream Events](../chat/stream-events). For the request body, see [AG-UI Client Compliance](../migration/ag-ui-compliance).

## Advanced

### Usage on the wire and in process

The wire uses the spec `usage[]` array with `inputTokens`. In process, `usage` is the TanStack `TokenUsage` type with `promptTokens`. The client rebuilds `TokenUsage` from the array.

### `RUN_ERROR`

An AG-UI `RUN_ERROR` has `message` and an optional `code` at the top level. Put the correlation ids in `metadata.tanstack`:

```json
{
  "type": "RUN_ERROR",
  "message": "Provider timeout",
  "code": "TIMEOUT",
  "metadata": {
    "tanstack": {
      "threadId": "thread-1",
      "runId": "run-1",
      "model": "gpt-6.1-sol"
    }
  }
}
```

For a rate limit, put the wait time in `metadata.tanstack.retryAfterMs`, in milliseconds. Clients read it from there. See [Rate limits](../chat/stream-events#rate-limits).

### Fields for other features

When you use one of these features, add its field:

- **Extra usage.** Spec `usage[]` also accepts `cachedInputTokens` and `reasoningTokens`. Put `cost` and other usage fields without a spec slot in `metadata.tanstack.usage`. The client merges them into `TokenUsage`.
- **Interrupt errors.** On `RUN_ERROR`, set `metadata.tanstack.interruptErrors`. Then `ChatClient` can match a failed interrupt submit.
- **Tool output error.** On `TOOL_CALL_RESULT`, set `metadata.tanstack.state` to `"output-error"` when the tool result is an error payload.
- **Message timestamps.** On wire messages, `metadata.tanstack.createdAt` is an ISO-8601 string.
- **Signatures.** Stream thinking signatures on `REASONING_ENCRYPTED_VALUE`. In the next-turn body, set the spec `encryptedValue` on `role: "reasoning"` messages and on `toolCalls`. Other provider fields for a tool call go in `metadata.tanstack.toolCallMetadata`. See [Thinking & Reasoning](../chat/thinking-content).
