---
title: Vue Chat UI
id: typed-headless-ui-vue
order: 3
description: "Build a typed, headless Vue chat UI with createChatHook and static primitives. Slots replace render callbacks."
keywords:
  - tanstack ai
  - createChatHook
  - vue
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-vue`. Import the UI factory from `@tanstack/ai-vue/ui`. Call `createChatHook({ options, ...components })` once. Your app calls `useAppChat()` to create the instance. Pass the descriptor as `ui` into `UIChat`, `UIProvider`, and the other static primitives.

> **Deprecated.** Do not install `@tanstack/ai-vue-ui`. That package re-exports this subpath until 1.0.0. See [Chat UI packages](../migration/create-ui).

The factory needs a `toolsComponents` entry for every tool name in `chatOptions`. It also needs an `interruptsComponents.generic` entry for every interrupt id. `generic.fallback` is optional. Widgets go in `components`, `partsComponents`, `toolsComponents`, and `interruptsComponents`, the same way Form and Table register components.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

The [chat UI recipes](./recipes/index) show the same option groups one at a time. The code there is React, and the shape carries over.

## Client

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatHook, UIChat } from '@tanstack/ai-vue/ui'
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

const { useAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
  layout: defineComponent((_, { slots }) => () =>
    h('div', [slots.messages?.(), slots.interrupts?.(), slots.queue?.(), slots.input?.()]),
  ),
  message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
  },
  partsComponents: {
  fallback: defineComponent({
    props: ['part'],
    setup(props) {
      return () => h('span', props.part.type)
    },
  }),
  },
  toolsComponents: {
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
    const chat = useAppChat({ threadId: 'support-1' })
    return () => h(UIChat, { ui, chat })
  },
})
```

Layout uses slots `messages`, `interrupts`, `queue`, and `input`. Message uses slot `parts`. Manual lists use the default slot on `UIMessages` with `{ messages }`.

## Type a component in its own file

Use `ToolProps` on the component props. Share the same `chatOptions` object that you pass to `createChatHook`.

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatHook, type ToolProps } from '@tanstack/ai-vue/ui'
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

export const { useAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
    layout: defineComponent((_, { slots }) => () =>
      h('div', [slots.messages?.(), slots.interrupts?.(), slots.input?.()]),
    ),
    message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
  },
  partsComponents: { fallback: defineComponent(() => () => null) },
  toolsComponents: { getWeather: WeatherTool },
})
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. Call `ui.useChatContext()` when a component needs live chat. That call opts the component into chat updates. Nested children can call it too.

## Read chat from `ui.useChatContext()`

Call `ui.useChatContext()` inside a child of `UIChat` or `UIProvider`.

```ts
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatHook, UIChat } from '@tanstack/ai-vue/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
    layout: defineComponent((_, { slots }) => () =>
      h('main', [h(StatusLine), slots.messages?.()]),
    ),
    message: defineComponent((_, { slots }) => () => h('article', slots.parts?.())),
  },
  partsComponents: { fallback: defineComponent(() => () => null) },
})

// Declared after `ui`, and annotated, so that reading `ui.useChatContext()`
// here does not form an inference cycle with the components map that renders
// it. `h(StatusLine)` above only runs at render time, so the order is fine.
const StatusLine: Component = defineComponent({
  setup() {
    const chat = ui.useChatContext()
    return () => {
      const messages = Array.isArray(chat.messages) ? chat.messages : []
      return h('p', String(messages.length) + ' messages')
    }
  },
})

export default defineComponent({
  setup() {
    const chat = useAppChat()
    return () => h(UIChat, { ui, chat })
  },
})
```

`useChat(chatOptions)` from `@tanstack/ai-vue` owns the state. `ui.useChatContext()` reads the instance you passed into `UIChat`.

## Interrupts

Tool approvals sit in the tool when you read the `interrupt` prop. Put a component on `interruptsComponents.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interruptsComponents.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).
