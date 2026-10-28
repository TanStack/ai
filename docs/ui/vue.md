---
title: Vue Chat UI
id: typed-headless-ui-vue
order: 3
description: "Render a streaming chat in Vue with your own components. createChatHook types every tool, part, and interrupt, and slots place the pieces."
keywords:
  - tanstack ai
  - createChatHook
  - vue
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-vue/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then creates a chat with `useAppChat()` and renders it with `UIChat`. You supply every visible component. There is no default markup or style.

> [!NOTE]
> Upgrading from `@tanstack/ai-vue-ui`? Read [Upgrade to 1.0](../migration/v1#chat-ui-components).

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put `OPENAI_API_KEY` in your server environment. Then add a `POST` route at `/api/chat`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })

  return toServerSentEventsResponse(stream)
}
```

3. Create `src/chat-ui.ts`:

```ts
import { defineComponent, h } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import { createChatHook } from '@tanstack/ai-vue/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export const { useAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
    layout: defineComponent((_, { slots }) => () =>
      h('section', slots.messages?.()),
    ),
    message: defineComponent({
      props: ['message'],
      setup(props, { slots }) {
        return () =>
          h('article', { 'data-role': props.message.role }, slots.parts?.())
      },
    }),
  },
  partsComponents: {
    text: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('p', props.part.content)
      },
    }),
    fallback: defineComponent(() => () => null),
  },
})
```

4. Create `src/Chat.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { UIChat } from '@tanstack/ai-vue/ui'
import { ui, useAppChat } from './chat-ui'

const chat = useAppChat({ threadId: 'support-chat' })
const draft = ref('')

function send() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  void chat.sendMessage(text)
}
</script>

<template>
  <main>
    <UIChat :ui="ui" :chat="chat" />
    <form @submit.prevent="send">
      <input v-model="draft" />
      <button type="submit">Send</button>
    </form>
  </main>
</template>
```

5. Render `<Chat />` and send a message.

The reply streams into the page as the model writes it.

## How it works

- `createChatHook` runs once, at module scope. It binds `chatOptions` to your components. It returns `ui`, the descriptor that `UIChat` reads.
- `useAppChat({ threadId })` creates one chat instance. `UIChat` renders that instance with your components.
- `layout` places the message list with the `messages` slot. `message` gets one message plus a `parts` slot. The `parts` slot picks a component for each part.
- `partsComponents.text` renders text. `fallback` catches every part type that you did not register.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React, and the option names are the same in Vue.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. A tool component gets the `part`, `result`, and `interrupt` props.

```ts ignore
toolsComponents: {
  getWeather: defineComponent({
    props: ['part'],
    setup(props) {
      return () =>
        props.part.state === 'complete'
          ? h('p', `${props.part.input?.city}: ${props.part.output?.temperature}`)
          : h('p', 'Looking up weather')
    },
  }),
},
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` prop:

```ts ignore
toolsComponents: {
  deleteFile: defineComponent({
    props: ['part', 'interrupt'],
    setup(props) {
      return () =>
        props.interrupt?.status === 'pending'
          ? h(
              'button',
              { onClick: () => props.interrupt.resolveInterrupt(true) },
              `Delete ${props.part.input?.path}`,
            )
          : h('p', props.part.input?.path)
    },
  }),
},
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. Full example: [Ask before a tool runs](./recipes/tool-approval).

### Ask the user your own question

Define the question with `defineInterrupt`. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render the `interrupts` slot in the layout:

```ts ignore
const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

// In createChatHook:
interruptsComponents: {
  generic: {
    choosePlan: defineComponent({
      props: ['interrupt'],
      setup(props) {
        return () =>
          h(
            'button',
            { onClick: () => props.interrupt.resolveInterrupt('pro') },
            props.interrupt.payload?.title,
          )
      },
    }),
  },
},
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as a prop. Read the chat from context inside the widget. This also moves the composer into the layout: register it as `input`, then render the `input` slot.

A widget that the factory registers cannot read `ui` from the same call. Create the context first with `createChatHookContexts()`, and pass its `chatKey` under `context`:

```ts
import { defineComponent, h, ref } from 'vue'
import { fetchServerSentEvents } from '@tanstack/ai-vue'
import {
  createChatHook,
  createChatHookContexts,
} from '@tanstack/ai-vue/ui'

const { chatKey, useChatContext } = createChatHookContexts()

const ChatInput = defineComponent(() => {
  const chat = useChatContext()
  const draft = ref('')

  return () =>
    h(
      'form',
      {
        onSubmit: (event: Event) => {
          event.preventDefault()
          const text = draft.value.trim()
          if (!text) return
          draft.value = ''
          void chat.sendMessage(text)
        },
      },
      [
        h('input', {
          value: draft.value,
          disabled: chat.isLoading.value,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement) {
              draft.value = event.target.value
            }
          },
        }),
        h('button', { type: 'submit' }, 'Send'),
      ],
    )
})

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export const { useAppChat, ui } = createChatHook({
  options: chatOptions,
  context: { chatKey },
  components: {
    input: ChatInput,
    layout: defineComponent((_, { slots }) => () =>
      h('main', [slots.messages?.(), slots.input?.()]),
    ),
    message: defineComponent((_, { slots }) => () =>
      h('article', slots.parts?.()),
    ),
  },
  partsComponents: { fallback: defineComponent(() => () => null) },
})
```

In Vue, `chat.messages`, `chat.isLoading`, and `chat.error` are refs. Read them with `.value` in script. Call `useChatContext()` only inside `UIChat` or `UIProvider`. A call outside that tree throws.

### Render markdown

Model replies arrive as markdown. Register `TextPart` from `@tanstack/ai-vue/ui` as the text part:

```ts ignore
import { TextPart } from '@tanstack/ai-vue/ui'

partsComponents: {
  text: defineComponent({
    props: ['part'],
    setup(props) {
      return () => h(TextPart, { content: props.part.content })
    },
  }),
},
```

`TextPart` uses [TanStack Markdown](https://tanstack.com/markdown). It escapes raw HTML and removes executable URLs. To color fenced code, read [Highlight markdown code](./markdown).

### Type a widget in its own file

Move a widget to its own file and type its props with `ToolProps`, `PartProps`, or `InterruptProps`. Pass `typeof chatOptions` and a name:

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

Put `chatOptions` in a shared module so every widget file can import its type.

You now have a typed chat UI in Vue. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot). In Vue, components place content with slots:

- `layout`: the `messages`, `interrupts`, `queue`, and `input` slots.
- `message`: the `message` prop and the `parts` slot.

`useAppChat()` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`.

### Approvals and generic interrupts

- A tool approval renders in the tool when you read the `interrupt` prop.
- To show it in the list instead, register a component under `interruptsComponents.tools` and render the `interrupts` slot.
- Generic interrupts always render in the list. `generic.fallback` renders an unregistered id and an unbound interrupt. If the copy must be different, branch on `interrupt.kind === 'unbound'`.

### Use `ui.useChatContext()` in a child file

A child component in its own file can import `ui` and call `ui.useChatContext()`. Inside the factory module, declare the child after the `createChatHook` call. Annotate it as `Component`, so its type does not depend on the components map that renders it:

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

// h(StatusLine) runs only at render time, so this order is safe.
const StatusLine: Component = defineComponent({
  setup() {
    const chat = ui.useChatContext()
    return () => h('p', `${chat.messages.value.length} messages`)
  },
})

export default defineComponent({
  setup() {
    const chat = useAppChat({ threadId: 'support-chat' })
    return () => h(UIChat, { ui, chat })
  },
})
```

### Walk messages yourself

`UIMessages` has a default slot with `{ messages }`. `UIMessage` has a default slot with `{ parts }`. Pass `ui` to each one.

### `TextPart` options

- `highlighter`: a synchronous `CodeHighlighter`. Its output is trusted HTML, so use `createTanStackMarkdownHighlighter` or another highlighter that escapes source text.
- `extensions`: more TanStack Markdown extensions. The streaming extension is always on.
- `class`, `userClass`, `assistantClass`: classes for the wrapper. Pass `role` to apply the role class.

If you still pass `remarkPlugins`, `rehypePlugins`, or `disableDefaultPlugins`, read [TextPart markdown](../migration/text-part-markdown).
