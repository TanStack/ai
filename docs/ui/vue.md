---
title: Vue Chat UI
id: typed-headless-ui-vue
order: 3
description: "Build a typed, headless Vue chat UI with createUI and static primitives. Slots replace render callbacks."
keywords:
  - tanstack ai
  - createUI
  - vue
  - headless ui
---

Install `@tanstack/ai-vue-ui`. Call `createUI(chatOptions)` once. Pass the descriptor as `ui` into `UIChat`, `UIProvider`, and the other static primitives.

The server route matches the [React page](./react). Use `gpt-5.2` on the OpenAI text adapter.

## Client

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-vue'
import { createUI, UIChat } from '@tanstack/ai-vue-ui'
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

const ui = createUI(chatOptions)

const components = ui.defineComponents({
  layout: defineComponent((_, { slots }) => () => slots.messages?.()),
  message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
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
  interrupts: { fallback: defineComponent(() => () => null) },
})

export default defineComponent({
  setup() {
    const chat = useChat(chatOptions)
    return () => h(UIChat, { ui, chat, components })
  },
})
```

Layout uses slots `messages`, `interrupts`, and `input`. Message uses slot `parts`. Manual lists use the default slot on `UIMessages` with `{ messages }`.

The typed tool map, interrupt map, and fallback rules match the [React contract](./react).
