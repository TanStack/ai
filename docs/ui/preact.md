---
title: Preact Chat UI
id: typed-headless-ui-preact
order: 5
description: "Render a streaming chat in Preact with your own components. createChatHook types every tool, part, and interrupt, with the same API as React."
keywords:
  - tanstack ai
  - createChatHook
  - preact
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-preact/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then renders the chat with one hook call. The API is the same as [React](./react). Widgets are Preact components. You supply every visible component. There is no default markup or style.

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai

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

3. Create `src/chat.tsx`:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-preact'
import { createChatHook } from '@tanstack/ai-preact/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: (props) => (
      <section>
        <props.Messages />
      </section>
    ),
    message: (props) => (
      <article data-role={props.message.role}>
        <props.Parts />
      </article>
    ),
  },
  partsComponents: {
    text: (props) => <p>{props.part.content}</p>,
    fallback: () => null,
  },
})

export function ChatScreen() {
  const chat = useAppChat({ threadId: 'support-chat' })

  return (
    <main>
      <chat.AppChat />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const field = event.currentTarget.elements.namedItem('message')
          if (!(field instanceof HTMLInputElement)) return
          const text = field.value.trim()
          if (!text) return
          field.value = ''
          void chat.sendMessage(text)
        }}
      >
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    </main>
  )
}
```

4. Render `<ChatScreen />` and send a message.

The reply streams into the page as the model writes it.

## How it works

- `createChatHook` runs once, at module scope. It binds `chatOptions` to your components.
- `useAppChat({ threadId })` creates one chat instance. `chat.AppChat` renders that instance with your components.
- `layout` places the message list. `message` wraps one message. `Parts` picks a component for each part of that message.
- `partsComponents.text` renders text. `fallback` catches every part type that you did not register.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React, and the code is the same in Preact.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. `part.input` and `part.output` are typed from the tool schemas.

```tsx ignore
toolsComponents: {
  getWeather: (props) =>
    props.part.state === 'complete' ? (
      <p>
        {props.part.input?.city}: {props.part.output?.temperature}
      </p>
    ) : (
      <p>Looking up weather</p>
    ),
},
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` prop:

```tsx ignore
toolsComponents: {
  deleteFile: (props) =>
    props.interrupt?.status === 'pending' ? (
      <button onClick={() => props.interrupt?.resolveInterrupt(true)}>
        Delete {props.part.input?.path}
      </button>
    ) : (
      <p>{props.part.input?.path}</p>
    ),
},
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. Full example: [Ask before a tool runs](./recipes/tool-approval).

### Ask the user your own question

Define the question with `defineInterrupt`. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render `props.Interrupts` in the layout:

```tsx ignore
const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

// In createChatHook:
interruptsComponents: {
  generic: {
    choosePlan: (props) => (
      <button onClick={() => props.interrupt.resolveInterrupt('pro')}>
        {props.interrupt.payload?.title}
      </button>
    ),
    fallback: (props) => <p>{props.interrupt.reason}</p>,
  },
},
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as a prop. Call `useChatContext()` inside the widget. This also moves the composer into the layout: register it as `input`, then render `props.Input`.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-preact'
import { createChatHook } from '@tanstack/ai-preact/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    input: () => {
      const chat = useChatContext()
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const field = event.currentTarget.elements.namedItem('message')
            if (!(field instanceof HTMLInputElement)) return
            const text = field.value.trim()
            if (!text) return
            field.value = ''
            void chat.sendMessage(text)
          }}
        >
          <input name="message" disabled={chat.isLoading} />
          <button type="submit">Send</button>
        </form>
      )
    },
    layout: (props) => (
      <main>
        <props.Messages />
        <props.Input />
      </main>
    ),
    message: (props) => (
      <article>
        <props.Parts />
      </article>
    ),
  },
  partsComponents: {
    text: (props) => <p>{props.part.content}</p>,
    fallback: () => null,
  },
})

export function ChatScreen() {
  const chat = useAppChat({ threadId: 'support-chat' })
  return <chat.AppChat />
}
```

Call `useChatContext()` only inside `chat.AppChat`. A call outside that tree throws. For hooks inside a widget, import them from `preact/hooks`.

### Render markdown

`@tanstack/ai-preact/ui` has no `TextPart` component. Render `part.content` in your own text part, with the markdown library of your choice.

### Type a widget in its own file

Move a widget to its own file and type its props with `ToolProps`, `PartProps`, or `InterruptProps`. Pass `typeof chatOptions` and a name:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-preact'
import { createChatHook, type ToolProps } from '@tanstack/ai-preact/ui'
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

export function WeatherTool(
  props: ToolProps<typeof chatOptions, 'getWeather'>,
) {
  return <strong>{props.part.input?.city}</strong>
}

export const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: (props) => <props.Messages />,
    message: (props) => (
      <article>
        <props.Parts />
      </article>
    ),
  },
  partsComponents: { fallback: () => null },
  toolsComponents: { getWeather: WeatherTool },
})
```

Put `chatOptions` in a shared module so every widget file can import its type.

You now have a typed chat UI in Preact. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot). In Preact, `layout` gets `Messages`, `Interrupts`, and `Queue`, plus `Input` when you register `input`.

`useAppChat()` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`.

### Approvals, interrupts, and the queue

These work the same as in React:

- [Approval next to the tool, or in the list](./react#approval-next-to-the-tool-or-in-the-list)
- [Generic interrupts and `fallback`](./react#generic-interrupts-and-fallback)
- [Show queued messages](./react#show-queued-messages)
- [List `input` before `layout`](./react#list-input-before-layout)
- [Widgets in other files](./react#widgets-in-other-files), with `createChatHookContexts` from `@tanstack/ai-preact/ui`
