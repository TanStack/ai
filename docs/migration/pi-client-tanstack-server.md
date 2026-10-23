---
title: pi UI with a TanStack AI server
id: pi-client-tanstack-server
order: 7
description: "Serve a pi UI from TanStack AI chat(). Read the pi request with chatParamsFromPiRequest, convert the chat() events to pi agent events with toPiAgentEvents, and stream them to the client, with tool approvals and client tools."
keywords:
  - tanstack ai
  - pi
  - pi-agent-core
  - AgentEvent
  - chat
  - toPiAgentEvents
  - migration
---

Serve a pi UI from TanStack AI `chat()`. Read the pi request with `chatParamsFromPiRequest`, and convert the `chat()` events to pi agent events with `toPiAgentEvents`. The UI reads the same `AgentEvent`s that `agentLoop()` gives.

Use this page to move the server first. To move the client first, see [TanStack useChat with a pi agent](./pi-agent-tanstack-client).

> [!WARNING]
> This bridge connects two different event formats. Some features change shape or are dropped on the way (see [pi bridge compatibility](./pi-compatibility)).

## 1. Install the packages

On the server:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
vue: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
solid: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
svelte: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
preact: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
angular: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
octane: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
vanilla: @tanstack/ai @tanstack/ai-anthropic @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai

<!-- ::end:tabs -->

## 2. Serve chat() as pi agent events

The pi client posts `{ threadId, messages }` with pi messages. `chatParamsFromPiRequest` checks the body and returns the `chat()` params. The route sends one pi event per line (NDJSON):

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import {
  chatParamsFromPiRequest,
  toPiAgentEvents,
} from '@tanstack/ai-pi-stream'

export async function POST(request: Request) {
  const params = await chatParamsFromPiRequest(request)

  const events = toPiAgentEvents(
    chat({
      adapter: anthropicText('claude-fable-5-1'),
      systemPrompts: ['You are a helpful assistant.'],
      ...params,
    }),
  )

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await events.next()
      if (done) controller.close()
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
```

- `chatParamsFromPiRequest` drops the `system` messages of the client, so the route sets the system prompt. A body that is not a pi request gets a 400 response.
- Each model call of `chat()` is one pi turn with one assistant message.
- The server tools of `chat()` show as `tool_execution_start` and `tool_execution_end`, then a `toolResult` message.
- `agent_end` carries the new messages of the run. The prompt stays on the client.

## 3. Read the events on the pi client

Post the history, read the lines, and pass each event to the code that renders `agentLoop()` events:

```typescript
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { PiBridgeEvent } from '@tanstack/ai-pi-stream'

export async function* runRemoteAgent(
  body: { threadId: string; messages: Array<AgentMessage> },
): AsyncGenerator<PiBridgeEvent> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.body) throw new Error('No response body')

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line) yield JSON.parse(line)
    }
  }
}
```

When `agent_end` arrives, append its `messages` to the history after the prompt. The next request sends that history back, and `chat()` replays it.

Two pi messages carry `chat()` data that pi has no type for. They come as `message_start` and `message_end`:

- `tanstack-interrupt`: the run paused. See the next step.
- `tanstack-event`: state, activity, steps, custom events and subagent events, as the AG-UI `event`.

## 4. Answer tool approvals

A `chat()` tool with `needsApproval: true` pauses the run. The pi client gets a `tanstack-interrupt` message with the paused `runId` and the `interrupts`. Send an answer for each interrupt in `resume`, with the history:

```typescript
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { TanStackInterruptMessage } from '@tanstack/ai-pi-stream'

export function approve(
  threadId: string,
  history: Array<AgentMessage>,
  paused: TanStackInterruptMessage,
  approved: boolean,
) {
  return {
    threadId,
    messages: history,
    parentRunId: paused.runId,
    resume: paused.interrupts.map((interrupt) => ({
      interruptId: interrupt.id,
      status: 'resolved',
      payload: { approved },
    })),
  }
}
```

Post this body as in step 3. `chat()` runs or denies the tool, and the reply continues. If the history keeps the `tanstack-interrupt` message, you can leave out `parentRunId`.

## 5. Run client tools

Send the pi tools that the client runs in `tools`. `chat()` calls them like the client tools of `useChat`:

```typescript
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Tool } from '@earendil-works/pi-ai'

export function withClientTools(
  threadId: string,
  messages: Array<AgentMessage>,
  tools: Array<Tool>,
) {
  return { threadId, messages, tools }
}
```

When the model calls one, the assistant message stops with `stopReason: 'toolUse'`. Run the tool, append its `toolResult` message to the history, and post again. `chat()` continues from the result.

Send a prompt. The pi UI renders the `chat()` reply with the same events as a local pi agent.
