---
title: Vue Chat UI
id: typed-headless-ui-vue
order: 3
description: "Build a typed, headless Vue chat UI with createChatUI and static primitives. Slots replace render callbacks."
keywords:
  - tanstack ai
  - createChatUI
  - vue
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-vue-ui`. Call `createChatHook(chatOptions)` and `createChatUI(chatOptions)` once. Your app calls `useChat()` to create the instance. Pass the descriptor as `ui` into `UIChat`, `UIProvider`, and the other static primitives.

`defineComponents` needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```ts
import { defineComponent, h } from 'vue'
import { createChatHook, fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatUI, UIChat } from '@tanstack/ai-vue-ui'
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

const { useChat } = createChatHook(chatOptions)
const ui = createChatUI(chatOptions)

const components = ui.defineComponents({
  layout: defineComponent((_, { slots }) => () =>
    h('div', [slots.messages?.(), slots.interrupts?.(), slots.input?.()]),
  ),
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
})

export default defineComponent({
  setup() {
    const chat = useChat()
    return () => h(UIChat, { ui, chat, components })
  },
})
```

Layout uses slots `messages`, `interrupts`, and `input`. Message uses slot `parts`. Manual lists use the default slot on `UIMessages` with `{ messages }`.

## Type a component in its own file

Use `ToolProps` on the component props. Share the same `chatOptions` object that you pass to `createChatUI`.

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatUI, type ToolProps } from '@tanstack/ai-vue-ui'
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

export const WeatherTool = defineComponent(
  (props: ToolProps<typeof chatOptions, 'getWeather'>) => {
    return () => h('strong', props.part.input?.city)
  },
)

const ui = createChatUI(chatOptions)

export const components = ui.defineComponents({
  layout: defineComponent((_, { slots }) => () =>
    h('div', [slots.messages?.(), slots.interrupts?.(), slots.input?.()]),
  ),
  message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
  parts: { fallback: defineComponent(() => () => null) },
  tools: { getWeather: WeatherTool },
})
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. Call `ui.useChat()` when a component needs live chat. That call opts the component into chat updates. Nested children can call it too.

## Read chat from `ui.useChat()`

Call `ui.useChat()` inside a child of `UIChat` or `UIProvider`.

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-vue'
import { createChatUI, UIChat } from '@tanstack/ai-vue-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const ui = createChatUI(chatOptions)

const StatusLine = defineComponent({
  setup() {
    const chat = ui.useChat()
    return () => {
      const messages = Array.isArray(chat.messages) ? chat.messages : []
      return h('p', String(messages.length) + ' messages')
    }
  },
})

const components = ui.defineComponents({
  layout: defineComponent((_, { slots }) => () =>
    h('main', [h(StatusLine), slots.messages?.()]),
  ),
  message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
  parts: { fallback: defineComponent(() => () => null) },
})

export default defineComponent({
  setup() {
    const chat = useChat(chatOptions)
    return () => h(UIChat, { ui, chat, components })
  },
})
```

`useChat(chatOptions)` from `@tanstack/ai-vue` owns the state. `ui.useChat()` reads the instance you passed into `UIChat`.

## Interrupts

Tool approvals sit in the tool when you read the `interrupt` prop. Put a component on `interrupts.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interrupts.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).
