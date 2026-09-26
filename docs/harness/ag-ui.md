---
title: Stream a harness over AG-UI
id: harness-ag-ui
order: 13
description: "Serve a harness session as a pure AG-UI event stream a bare @ag-ui/client can consume, with approvals as interrupts and token usage as metadata."
keywords:
  - tanstack ai
  - harness
  - AG-UI
  - SSE
  - interrupts
  - usage
---

A harness session already speaks AG-UI: `session.events()` yields events whose payloads are AG-UI protocol events. The `@tanstack/ai-harness/ag-ui` subpath is the thin, documented seam an AG-UI client consumes — a normalizer and an SSE handler a bare [`@ag-ui/client`](https://docs.ag-ui.com) `HttpAgent` can point at.

This does not replace the [harness protocol](./connect.md) or the [relay dashboard](./dashboard.md). AG-UI is the *run stream*; the harness protocol carries the *control plane* (pairing, snapshots, history, config). Use both: AG-UI for the conversation, the harness protocol for everything around it.

## Serve a session over AG-UI

`createAgUiHandler` is one `fetch` handler. `authorize` is required, so no endpoint is open by accident.

```ts group=harness-ag-ui
import { defineHarness, createHarnessHost } from '@tanstack/ai-harness'
import { createAgUiHandler } from '@tanstack/ai-harness/ag-ui'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const handler = createAgUiHandler({
  host,
  harness: assistant,
  authorize: (request) =>
    request.headers.get('authorization') ===
    `Bearer ${process.env.HARNESS_TOKEN}`
      ? { id: 'user-1' }
      : null,
  canAccess: (principal, threadId) => threadId.startsWith(principal.id),
})
```

`POST` a `RunAgentInput` to it. A body with a trailing user message runs a prompt; a body with `resume` entries answers the last turn's interrupts and continues. The response is `text/event-stream` of AG-UI events, encoded with `@ag-ui/encoder` so a protobuf-accepting client gets binary framing for free. The stream closes when the run reaches a terminal state.

## Consume it from a client

Point a bare `@ag-ui/client` `HttpAgent` at the handler's URL:

```ts group=harness-ag-ui-client
import { HttpAgent } from '@ag-ui/client'

const agent = new HttpAgent({
  url: 'https://example.com/agent',
  threadId: 'user-1/main',
  headers: { authorization: `Bearer ${process.env.HARNESS_TOKEN}` },
})

agent.addMessage({ id: 'u1', role: 'user', content: 'Summarize incidents' })
await agent.runAgent()

console.log(agent.messages.at(-1)) // the assistant's reply
```

The stream is strict AG-UI by default: it begins with `RUN_STARTED`, as a bare client requires. (The harness-native `CUSTOM` control events — `harness.operation.*`, `harness.question`, and friends — are dropped from the AG-UI stream; read them over the harness protocol's `/events` tier instead. Pass `stream: { includeHarnessEvents: true }` to keep them for a lenient consumer.)

## Event mapping

| Harness concept | AG-UI event |
| --- | --- |
| run start / end | `RUN_STARTED` / `RUN_FINISHED` |
| assistant text | `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` |
| tool call | `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` |
| approval / wait | `RUN_FINISHED` with `outcome.type === 'interrupt'` |
| resume | a new run whose `RunAgentInput.resume` answers the interrupts |
| subagent | `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` (with `subagentRunId`) |
| token usage | `metadata.tanstack.usage` on `RUN_FINISHED` |
| live spend (interim) | a `tanstack.spend` `CUSTOM` event |

## Approvals as interrupts

A turn that stops for approval finishes with a `RUN_FINISHED` whose `outcome.type === 'interrupt'`. `@ag-ui/client` collects these on `agent.pendingInterrupts`:

```ts group=harness-ag-ui-client
await agent.runAgent()

for (const interrupt of agent.pendingInterrupts) {
  console.log(interrupt.id, interrupt.message) // "Approval required to run remove"
}
```

Answer by starting a new run whose `resume` entries reference the interrupt ids:

```ts group=harness-ag-ui-resume
await fetch('https://example.com/agent', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.HARNESS_TOKEN}`,
  },
  body: JSON.stringify({
    threadId: 'user-1/main',
    runId: 'run-2',
    messages: [],
    tools: [],
    context: [],
    resume: [{ interruptId: 'approval_call_1', status: 'resolved', payload: true }],
  }),
})
```

The harness-native approval path (`session.resolve`, the CLI, and the relay dashboard) keeps working; AG-UI interrupt/resume is the AG-UI-shaped view of the same wait.

## Token usage and spend

`RUN_FINISHED` carries usage under `metadata.tanstack.usage` as a `NormalizedUsage` (`inputTokens`, `outputTokens`, `totalTokens`). Read it directly, or normalize any provider's usage with `normalizeUsage`:

```ts group=harness-ag-ui-usage
import { normalizeUsage } from '@tanstack/ai-harness/ag-ui'

normalizeUsage([{ inputTokens: 10, outputTokens: 5 }])
// { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
normalizeUsage({ promptTokens: 8, completionTokens: 2, totalTokens: 10 })
// { inputTokens: 8, outputTokens: 2, totalTokens: 10 }
```

For a live spend meter, opt into interim ticks. After each run that reports usage, the stream carries a `tanstack.spend` `CUSTOM` event with that run's usage and a running cumulative total:

```ts group=harness-ag-ui
const meteredHandler = createAgUiHandler({
  host,
  harness: assistant,
  authorize: () => ({ id: 'user-1' }),
  stream: { emitSpendEvents: true },
})
```

Spend rides `CUSTOM` because the AG-UI spec has no first-class spend event yet — track that convention deliberately.

## Pin the AG-UI version

The AG-UI spec is still evolving. This bridge is built and tested against `@ag-ui/core@1.0.0`, `@ag-ui/encoder@1.0.0`, and `@ag-ui/client@1.0.0`. Pin those versions and move them on purpose, not by floating range.
