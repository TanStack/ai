---
title: pi UI with a TanStack AI server
id: pi-client-tanstack-server
order: 7
description: "Serve a pi UI from TanStack AI chat(). Read the pi history with fromPiMessages, convert the chat() events to pi agent events with toPiAgentEvents, and stream them to the client."
keywords:
  - tanstack ai
  - pi
  - pi-agent-core
  - AgentEvent
  - chat
  - toPiAgentEvents
  - migration
---

Serve a pi UI from TanStack AI `chat()`. Read the pi history with `fromPiMessages`, and convert the `chat()` events to pi agent events with `toPiAgentEvents`. The UI reads the same `AgentEvent`s that `agentLoop()` gives.

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

The pi client posts a thread id and its messages. `fromPiMessages` turns the messages into `chat()` params. The route sends one pi event per line (NDJSON):

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { fromPiMessages, toPiAgentEvents } from '@tanstack/ai-pi-stream'

export async function POST(request: Request) {
  const body = await request.json()
  // The client sends the history. Keep its messages, and set the system
  // prompt here, so a client cannot change it.
  const { messages } = fromPiMessages(body.messages)

  const events = toPiAgentEvents(
    chat({
      adapter: anthropicText('claude-fable-5-1'),
      threadId: body.threadId,
      messages,
      systemPrompts: ['You are a helpful assistant.'],
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

- The route sets the system prompt. A `system` message in the request is a client value, so the route does not use the `systemPrompts` that `fromPiMessages` returns.
- Each model call of `chat()` is one pi turn with one assistant message.
- The server tools of `chat()` show as `tool_execution_start` and `tool_execution_end`, then a `toolResult` message.
- `agent_end` carries the new messages of the run. The prompt stays on the client.

## 3. Read the events on the pi client

Post the history, read the lines, and pass each event to the code that renders `agentLoop()` events:

```typescript
import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'

export async function* runRemoteAgent(
  threadId: string,
  messages: Array<AgentMessage>,
): AsyncGenerator<AgentEvent> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, messages }),
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

Send a prompt. The pi UI renders the `chat()` reply with the same events as a local pi agent.
