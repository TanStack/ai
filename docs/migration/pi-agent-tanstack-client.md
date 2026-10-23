---
title: TanStack useChat with a pi agent
id: pi-agent-tanstack-client
order: 6
description: "Put TanStack AI useChat in front of a pi agent. Convert the pi agent events to AG-UI events with fromPiAgentEvents and serve them as server-sent events. The pi agent loop does not change."
keywords:
  - tanstack ai
  - pi
  - pi-agent-core
  - agentLoop
  - useChat
  - fromPiAgentEvents
  - migration
---

Put TanStack AI `useChat` in front of a pi agent. Wrap the pi `agentLoop()` stream with `fromPiAgentEvents`, and serve it with `toServerSentEventsResponse`. The pi agent and its tools do not change.

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

## 2. Serve the pi agent as AG-UI events

The route reads the `useChat` request and converts the history to pi messages. The last message is the new prompt. Then the route runs the pi agent loop and converts its events:

```typescript
import { agentLoop } from '@earendil-works/pi-agent-core'
import { createModels } from '@earendil-works/pi-ai'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import {
  chatParamsFromRequest,
  convertMessagesToModelMessages,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fromPiAgentEvents, toPiMessages } from '@tanstack/ai-pi-stream'

const models = createModels()
models.setProvider(anthropicProvider())

export async function POST(request: Request) {
  const model = models.getModel('anthropic', 'claude-fable-5-1')
  if (!model) throw new Error('Model not found')

  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const history = toPiMessages(convertMessagesToModelMessages(messages), {
    systemPrompts: ['You are a helpful assistant.'],
    model: { api: model.api, provider: model.provider, model: model.id },
  })
  const prompt = history.pop()

  const events = agentLoop(
    prompt ? [prompt] : [],
    { messages: history, tools: [] },
    { model, convertToLlm: (piMessages) => piMessages },
    request.signal,
    models.streamSimple.bind(models),
  )

  return toServerSentEventsResponse(
    fromPiAgentEvents(events, { threadId, runId }),
  )
}
```

- `model` stamps the history with the pi model. Then pi sends the reasoning signatures back to the same model.
- Add your pi tools to `tools`. `useChat` shows their calls and results.

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

Send a message. The pi agent replies in `useChat`, and the next request sends pi the whole history, signatures included.
