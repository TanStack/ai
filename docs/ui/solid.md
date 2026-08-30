---
title: Solid Chat UI
id: typed-headless-ui-solid
order: 2
description: "Render a typed chat tree with Chat and a component map. Keep accessors tracked."
keywords:
  - tanstack ai
  - Chat
  - solid
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-solid`. Import `Chat` from `@tanstack/ai-solid/ui`. Call `useChat(chatOptions)` in the screen. Pass a module-level `components` object into `Chat`. Do not destructure reactive props.

> **Deprecated.** Do not install `@tanstack/ai-solid-ui`. That package re-exports this subpath until 1.0.0. See [Chat UI packages](../migration/create-ui).

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { Chat, type ChatUIComponents } from '@tanstack/ai-solid/ui'
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

const components = {
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
} satisfies ChatUIComponents<typeof chatOptions>

export function Support() {
  const chat = useChat(chatOptions)
  return <Chat chat={chat} components={components} />
}
```

Use `ToolProps` the same way as React. Keep the `props` object so Solid can track it. `layout` and `input` receive `chat` as a prop. Nested children can call `useChatContext()` inside `Chat`.
