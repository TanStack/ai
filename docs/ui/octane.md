---
title: Octane Chat UI
id: typed-headless-ui-octane
order: 6
description: "Build a typed, headless Octane chat UI with createChatHook. The API matches React."
keywords:
  - tanstack ai
  - createChatHook
  - octane
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-octane`. Import the UI factory from `@tanstack/ai-octane/ui`. Call `createChatHook({ options, ...components })` once at module scope. Your app calls `useAppChat()` to create the instance. Render `<chat.AppChat />`.

The factory API matches [React](./react). Widgets are Octane components. Import hooks from `octane`.

The factory needs a `toolsComponents` entry for every tool name in `chatOptions`. It also needs an `interruptsComponents.generic` entry for every interrupt id. `generic.fallback` is optional.

The server route matches the [React page](./react). The [chat UI recipes](./recipes/index) show the same option groups. The code there is React, and the shape carries over.

## Client

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-octane'
import { createChatHook } from '@tanstack/ai-octane/ui'
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

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: (props) => (
      <main>
        <props.Messages />
        <props.Interrupts />
        <props.Queue />
      </main>
    ),
    message: (props) => (
      <article>
        <props.Parts />
      </article>
    ),
  },
  partsComponents: { fallback: (props) => <span>{props.part.type}</span> },
  toolsComponents: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
  },
})

export function ChatScreen() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```
