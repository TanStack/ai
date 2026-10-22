---
title: Solid Chat UI
id: typed-headless-ui-solid
order: 2
description: "Render a streaming chat in Solid with your own components. createChatHook types every tool, part, and interrupt, and props stay tracked."
keywords:
  - tanstack ai
  - createChatHook
  - solid
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-solid/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then renders the chat with one hook call. You supply every visible component. There is no default markup or style.

> [!NOTE]
> Upgrading from `@tanstack/ai-solid-ui`? Read [Upgrade to 1.0](../migration/v1#chat-ui-components).

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai

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
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createChatHook } from '@tanstack/ai-solid/ui'

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

Read props as `props.part` and `props.Messages`. Do not destructure them, or Solid stops tracking the values.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React, and the option names are the same in Solid.

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
import { createSignal } from 'solid-js'
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createChatHook } from '@tanstack/ai-solid/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    input: () => {
      const chat = useChatContext()
      const [draft, setDraft] = createSignal('')
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void chat.sendMessage(draft())
            setDraft('')
          }}
        >
          <input
            value={draft()}
            disabled={chat.isLoading()}
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
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

In Solid, `chat.messages`, `chat.isLoading`, and `chat.error` are accessors. Call them, such as `chat.messages().length`. Call `useChatContext()` only inside `chat.AppChat`. A call outside that tree throws.

### Render markdown

Model replies arrive as markdown. Register `TextPart` from `@tanstack/ai-solid/ui` as the text part:

```tsx ignore
import { TextPart } from '@tanstack/ai-solid/ui'

partsComponents: {
  text: (props) => <TextPart content={props.part.content} />,
  fallback: () => null,
},
```

`TextPart` uses [TanStack Markdown](https://tanstack.com/markdown). It escapes raw HTML and removes executable URLs. To color fenced code, read [Highlight markdown code](./markdown).

### Type a widget in its own file

Move a widget to its own file and type its props with `ToolProps`, `PartProps`, or `InterruptProps`. Pass `typeof chatOptions` and a name. Keep the `props` object so Solid can track it:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createChatHook, type ToolProps } from '@tanstack/ai-solid/ui'
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

You now have a typed chat UI in Solid. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot). In Solid, `layout` gets `Messages`, `Interrupts`, and `Queue`, plus `Input` when you register `input`.

`useAppChat()` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`.

### Approvals and generic interrupts

- A tool approval renders in the tool when you read `props.interrupt`.
- To show it in the list instead, register a component under `interruptsComponents.tools` and render `props.Interrupts`.
- Generic interrupts always render in the list. `generic.fallback` renders an unregistered id and an unbound interrupt. If the copy must be different, branch on `interrupt.kind === 'unbound'`.

### List `input` before `layout`

If `input` is an inline `function` expression written after `layout`, TypeScript cannot see that an input is registered. Then `Input` is missing from the layout props.

To prevent this, put `input` first, or use an arrow function or a named component. If it still slips through, `<props.Input />` without a registered `input` warns once in development.

### Widgets in other files

Call `createChatHookContexts()` in its own module. Pass `chatContext`, `partContext`, and `interruptContext` to `createChatHook` under `context`. Widget files then import `useChatContext` from the contexts module, with no circular import.

### Walk messages yourself

`createChatUI` is the lower-level kit. The `UI.Messages` render callback gets an accessor:

```tsx ignore
<UI.Messages>{(messages) => <span>{messages().length}</span>}</UI.Messages>
```

### `TextPart` options

- `highlighter`: a synchronous `CodeHighlighter`. Its output is trusted HTML, so use `createTanStackMarkdownHighlighter` or another highlighter that escapes source text.
- `extensions`: more TanStack Markdown extensions. The streaming extension is always on.
- `class`, `userClass`, `assistantClass`: classes for the wrapper. Pass `role` to apply the role class.

If you still pass `remarkPlugins`, `rehypePlugins`, `disableDefaultPlugins`, or `components`, read [TextPart markdown](../migration/text-part-markdown).
