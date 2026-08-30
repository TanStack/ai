---
title: Vue Chat UI
id: typed-headless-ui-vue
order: 3
description: "Render a typed chat tree with Chat and a component map. Slots replace render callbacks."
keywords:
  - tanstack ai
  - Chat
  - vue
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-vue`. Import `Chat` from `@tanstack/ai-vue/ui`. Call `useChat(chatOptions)` in the screen. Pass a `components` object into `Chat`. Layout uses `messages`, `interrupts`, and `input` slots. Message uses a `parts` slot.

> **Deprecated.** Do not install `@tanstack/ai-vue-ui`. That package re-exports this subpath until 1.0.0. See [Chat UI packages](../migration/create-ui).

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-vue'
import { Chat } from '@tanstack/ai-vue/ui'
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
  layout: defineComponent((_, { slots }) => () =>
    h('main', [slots.messages?.(), slots.input?.()]),
  ),
  message: defineComponent((_, { slots }) => () =>
    h('article', slots.parts?.()),
  ),
  parts: {
    fallback: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('span', props.part.type)
      },
    }),
  },
  tools: {
    getWeather: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('strong', props.part.input?.city)
      },
    }),
  },
}

export default defineComponent({
  setup() {
    const chat = useChat(chatOptions)
    return () => h(Chat, { chat, components })
  },
})
```

Use `ToolProps` on a tool component's props. `input` receives `chat` as a prop.
