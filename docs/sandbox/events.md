---
title: Events
id: events
order: 9
description: "Read harness work as AG-UI chunks plus CUSTOM events for sessions, files, and diffs."
---

If you need to observe what the agent does on the client → consume the `chat()` stream.

Server-side hooks / debug → [Observability](./observability).

## Standard chunks

- Text (incremental)
- Tool calls (including bridged [tools](./tools))
- Reasoning (when the harness exposes it)
- Run lifecycle (started / finished)

## CUSTOM events

`chunk.type === 'CUSTOM'` with `name` + `value`:

| `name` | When | `value` |
| --- | --- | --- |
| `*.session-id` (per harness) | Session created/resumed | resumable session id |
| `file.changed` | Run completes (some harnesses) | `{ path: '.'; diff }` whole-tree git diff |
| `sandbox.file` | Per create/change/delete | `{ type, path, timestamp }` |
| `sandbox.file.diff` | Opt-in per file | `{ path, diff }` vs session git baseline |

Turn on per-file diffs:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  fileEvents: { diff: true },
})
```

Pass session id back via adapter `modelOptions.sessionId` to resume. Bridged tools may emit their own mid-execution CUSTOM events (e.g. code mode).

## Read CUSTOM on the client

Literal `chunk.name` narrows `chunk.value` — no cast:

```ts
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    console.log(chunk.value.type, chunk.value.path)
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file.diff') {
    console.log(chunk.value.path, chunk.value.diff)
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    console.log(chunk.value.diff)
  }
}
```

### Session ids

Compare the exact adapter literal:

```ts
import { resumeSession } from './session'
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'claude-code.session-id') {
    resumeSession(chunk.value.sessionId)
  }
}
```

`endsWith('.session-id')` does **not** narrow. For any adapter, write a type predicate:

```ts
import type { KnownCustomEvent, SessionIdEvent } from '@tanstack/ai'
import { resumeSession } from './session'
import { stream } from './my-run'

function isSessionIdEvent(chunk: KnownCustomEvent): chunk is SessionIdEvent {
  return chunk.name.endsWith('.session-id')
}

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && isSessionIdEvent(chunk)) {
    resumeSession(chunk.value.sessionId)
  }
}
```

Taxonomy → [Custom Events Reference](../protocol/custom-events).

## What gets stored

With [chat persistence](../persistence/chat-persistence) next to `withSandbox`:

| Produced | Stored? |
| --- | --- |
| Text | Yes (assistant message) |
| Tool calls + results | Yes |
| Reasoning | No |
| CUSTOM events | No |

UI built from CUSTOM (file list, console) is session-only unless you persist it.

Limits:

- Restored thread: tool cards in order, then full final text (not streamed replay).
- Stored results are strings; reopen never re-runs tools.

### Trim tool results

Cap size:

```ts
import type { ModelMessage } from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import { db } from './db'

const MAX_RESULT = 8_000

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const capped = messages.map((message: ModelMessage) =>
      message.role === 'tool' && typeof message.content === 'string'
        ? { ...message, content: message.content.slice(0, MAX_RESULT) }
        : message,
    )
    await db.saveThread(threadId, capped)
  },
  loadThread: (threadId) => db.loadThread(threadId),
}
```

Drop sandbox tool history (drop call + result together — orphan results break providers):

```ts
import { isSandboxToolCall } from '@tanstack/ai-sandbox'
import type { ModelMessage } from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import { db } from './db'

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const dropped = new Set<string>()
    const kept: Array<ModelMessage> = []
    for (const message of messages) {
      const calls = message.toolCalls
      if (calls && calls.length > 0 && calls.every(isSandboxToolCall)) {
        for (const call of calls) dropped.add(call.id)
        continue
      }
      if (
        message.role === 'tool' &&
        message.toolCallId !== undefined &&
        dropped.has(message.toolCallId)
      ) {
        continue
      }
      kept.push(message)
    }
    await db.saveThread(threadId, kept)
  },
  loadThread: (threadId) => db.loadThread(threadId),
}
```

Safe: next turn never re-sends sandbox tool names the provider was never given.

## Related

[Observability](./observability) · [Custom Events](../protocol/custom-events) · [Tools](./tools) · [Quick Start](./quick-start)
