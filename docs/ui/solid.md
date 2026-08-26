---
title: Solid Chat UI
id: typed-headless-ui-solid
order: 2
description: "Build a typed, headless Solid chat UI with createUI. Accessors stay tracked. Your app owns useChat."
keywords:
  - tanstack ai
  - createUI
  - solid
  - headless ui
---

Install `@tanstack/ai-solid-ui`, then call `createUI(chatOptions)` once at module scope. Do not destructure reactive props.

The server route matches the [React page](./react). Use `gpt-5.2` on the OpenAI text adapter.

## Client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { createUI } from '@tanstack/ai-solid-ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [getWeather],
}

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: (props) => (
    <>
      {props.renderMessages()}
      {props.renderInterrupts()}
      {props.renderInput()}
    </>
  ),
  message: (props) => <article>{props.renderParts()}</article>,
  parts: {
    fallback: (props) => <span>{props.part.type}</span>,
  },
  tools: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
  },
  interrupts: { fallback: () => null },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

Manual list: `<UI.Messages>{(messages) => <span>{messages().length}</span>}</UI.Messages>`.

The full component map, tool states, interrupt statuses, inline approvals, and context access match the [React contract](./react). Solid keeps accessors. Pass `props.chat`, `props.part`, and `props.renderParts()` without destructure.
