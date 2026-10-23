---
title: TanStack useChat with a pi agent
id: pi-agent-tanstack-client
order: 6
description: "Put TanStack AI useChat in front of a pi agent. runPiAgent runs the pi agent loop for a useChat request and streams AG-UI events, with tool approvals and client tools. The pi agent and its tools do not change."
keywords:
  - tanstack ai
  - pi
  - pi-agent-core
  - agentLoop
  - useChat
  - runPiAgent
  - fromPiAgentEvents
  - tool approval
  - migration
---

Put TanStack AI `useChat` in front of a pi agent. `runPiAgent` runs the pi agent loop for a `useChat` request and returns AG-UI events. Serve them with `toServerSentEventsResponse`. The pi agent and its tools do not change.

Use this page to move the client first. To move the server first, see [pi UI with a TanStack AI server](./pi-client-tanstack-server).

> [!WARNING]
> This bridge connects two different event formats. Some features change shape or are dropped on the way (see [pi bridge compatibility](./pi-compatibility)).

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai octane
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-pi-stream @earendil-works/pi-agent-core @earendil-works/pi-ai

<!-- ::end:tabs -->

## 2. Serve the pi agent

The route reads the `useChat` request and passes it to `runPiAgent` with the pi loop config, the model call and the pi tools:

```typescript
import { createModels, Type } from '@earendil-works/pi-ai'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { runPiAgent } from '@tanstack/ai-pi-stream'

const models = createModels()
models.setProvider(anthropicProvider())

const deleteParams = Type.Object({ path: Type.String() })
const deleteFile: AgentTool<typeof deleteParams> = {
  name: 'deleteFile',
  label: 'Delete file',
  description: 'Delete a file',
  parameters: deleteParams,
  execute: async (_id, { path }) => ({
    content: [{ type: 'text', text: `Deleted ${path}` }],
    details: undefined,
  }),
}

export async function POST(request: Request) {
  const model = models.getModel('anthropic', 'claude-fable-5-1')
  if (!model) throw new Error('Model not found')

  const params = await chatParamsFromRequest(request)

  return toServerSentEventsResponse(
    runPiAgent(params, {
      config: { model, convertToLlm: (piMessages) => piMessages },
      streamFn: models.streamSimple.bind(models),
      tools: [deleteFile],
      needsApproval: ['deleteFile'],
      systemPrompts: ['You are a helpful assistant.'],
      signal: request.signal,
    }),
  )
}
```

- The last message of the history is the prompt. The rest becomes pi messages, stamped with the pi model, so pi sends the reasoning signatures back to the same model.
- `systemPrompts` is set on the server. The request cannot change it.
- To run the pi loop yourself, convert its events with `fromPiAgentEvents(agentLoop(...), { threadId, runId })` and the history with `toPiMessages`. You then handle approvals and client tools yourself.

## 3. Connect useChat

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null,
          )}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => sendMessage(input)}>Send</button>
    </div>
  )
}
```

Each pi assistant message is one assistant message in `messages`, the same as each model call of `chat()`. Thinking, tool calls and tool results show as `thinking`, `tool-call` and `tool-result` parts.

## 4. Approve pi tool calls

A pi tool in `needsApproval` pauses the run before it runs. The approval shows in `interrupts`. Answer it with `resolveInterrupt({ approved })`:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Approvals() {
  const { interrupts } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return interrupts.map((interrupt) =>
    interrupt.kind === 'generic' && interrupt.metadata?.kind === 'approval' ? (
      <div key={interrupt.id}>
        Run {String(interrupt.metadata.toolName)}?
        <button onClick={() => interrupt.resolveInterrupt({ approved: true })}>
          Yes
        </button>
        <button onClick={() => interrupt.resolveInterrupt({ approved: false })}>
          No
        </button>
      </div>
    ) : null,
  )
}
```

- The next request carries the answer. `runPiAgent` runs an approved call with the pi `beforeToolCall` and `afterToolCall` hooks, then continues the loop.
- A denied call gets an error result with the `denied` outcome, and the model sees the denial.
- The other tool calls of the same model call run at once.
- The history comes from the client, as in a stateless `chat()` route. An approval runs only a tool in `needsApproval`, and never a call that already has a result. A pending call to any other pi tool gets an error result and does not run. If a person other than the user approves, keep the history on the server.

## 5. Run client tools

Pass a client tool to `useChat`, as for a `chat()` route. The request sends its name, description and JSON Schema, and `runPiAgent` declares it to pi:

```tsx
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

const getLocation = toolDefinition({
  name: 'getLocation',
  description: 'Get the location of the user',
  inputSchema: z.object({}),
}).client(() => ({ city: 'Sydney' }))

export function ChatWithLocation() {
  const { messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    tools: [getLocation],
  })
  return <pre>{JSON.stringify(messages, null, 2)}</pre>
}
```

When pi calls the tool, the run pauses. `useChat` runs the tool in the browser and sends the output. pi continues from that result.

Send a message. The pi agent replies in `useChat`, asks before it deletes a file, and the next request sends pi the whole history, signatures included.
