---
title: Remix Chat UI
id: typed-headless-ui-remix
order: 7
description: "Render a streaming chat in Remix 3 with your own components. createChatHook types every tool, part, and interrupt, and widgets are Remix setup functions."
keywords:
  - tanstack ai
  - createChatHook
  - remix
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-remix/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then creates a chat with `createAppChat(handle, { threadId })` and renders it with `ui.Chat`. Each widget is a Remix setup function that reads `handle.props`. You supply every visible component. There is no default markup or style.

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

remix: @tanstack/ai @tanstack/ai-remix @tanstack/ai-openai remix

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

3. Create `app/chat.tsx`:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-remix'
import {
  createChatHook,
  type LayoutProps,
  type MessageProps,
  type PartProps,
} from '@tanstack/ai-remix/ui'
import { clientEntry, on, type Handle } from 'remix/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { createAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
    layout(handle: Handle<LayoutProps<typeof chatOptions>>) {
      return () => {
        const { Messages } = handle.props
        return (
          <section>
            <Messages />
          </section>
        )
      }
    },
    message(handle: Handle<MessageProps<typeof chatOptions>>) {
      return () => {
        const { message, Parts } = handle.props
        return (
          <article data-role={message.role}>
            <Parts />
          </article>
        )
      }
    },
  },
  partsComponents: {
    text(handle: Handle<PartProps<typeof chatOptions, 'text'>>) {
      return () => <p>{handle.props.part.content}</p>
    },
    fallback() {
      return () => null
    },
  },
})

export const ChatScreen = clientEntry(
  import.meta.url,
  function ChatScreen(handle: Handle) {
    const chat = createAppChat(handle, { threadId: 'support-chat' })

    return () => (
      <main>
        <ui.Chat chat={chat} />
        <form
          mix={on('submit', (event) => {
            event.preventDefault()
            const form = event.currentTarget
            const text = String(new FormData(form).get('message') ?? '').trim()
            if (text === '') {
              return
            }
            form.reset()
            void chat.sendMessage(text)
          })}
        >
          <input name="message" />
          <button type="submit">Send</button>
        </form>
      </main>
    )
  },
)
```

4. Render `<ChatScreen />` and send a message.

The reply streams into the page as the model writes it.

## How it works

- `createChatHook` runs once, at module scope. It binds `chatOptions` to your components. It returns `ui`, the kit with `ui.Chat`.
- `createAppChat(handle, { threadId })` creates one chat instance inside a setup function. `ui.Chat` renders that instance with your components.
- `layout` places the message list. `message` wraps one message. `Parts` picks a component for each part of that message.
- `partsComponents.text` renders text. `fallback` catches every part type that you did not register.

Render `Messages` and `Parts` as tags, such as `<Messages />`, not as function calls.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React, and the option names are the same in Remix.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. Type its handle with `ToolProps`:

```tsx ignore
toolsComponents: {
  getWeather(handle: Handle<ToolProps<typeof chatOptions, 'getWeather'>>) {
    return () => {
      const { part } = handle.props
      if (part.state !== 'complete') return <p>Looking up weather</p>
      return (
        <p>
          {part.input?.city}: {part.output?.temperature}
        </p>
      )
    }
  },
},
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` prop:

```tsx ignore
toolsComponents: {
  deleteFile(handle: Handle<ToolProps<typeof chatOptions, 'deleteFile'>>) {
    return () => {
      const { part, interrupt } = handle.props
      if (interrupt?.status !== 'pending') return <p>{part.input?.path}</p>
      return (
        <button
          mix={on('click', () => interrupt.resolveInterrupt(true))}
        >
          Delete {part.input?.path}
        </button>
      )
    }
  },
},
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. Full example: [Ask before a tool runs](./recipes/tool-approval).

### Ask the user your own question

Define the question with `defineInterrupt`. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render `Interrupts` in the layout:

```tsx ignore
const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

// In createChatHook:
interruptsComponents: {
  generic: {
    choosePlan(
      handle: Handle<InterruptProps<typeof chatOptions, 'choosePlan'>>,
    ) {
      return () => {
        const { interrupt } = handle.props
        return (
          <button mix={on('click', () => interrupt.resolveInterrupt('pro'))}>
            {interrupt.payload?.title}
          </button>
        )
      }
    },
  },
},
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as a prop. Import `ui` and call `ui.useChatContext(handle)` inside the widget. This also moves the composer into the layout. Create `app/chat-input.tsx`:

```tsx ignore
import { on, type Handle, type RemixNode } from 'remix/ui'
import { ui } from './chat'

export function ChatInput(handle: Handle): () => RemixNode {
  const chat = ui.useChatContext(handle)

  return () => (
    <form
      mix={on('submit', (event) => {
        event.preventDefault()
        const form = event.currentTarget
        const text = String(new FormData(form).get('message') ?? '').trim()
        if (text === '') {
          return
        }
        form.reset()
        void chat.sendMessage(text)
      })}
    >
      <input name="message" disabled={chat.isLoading} />
      <button type="submit">Send</button>
    </form>
  )
}
```

Then:

1. Export `ui` from `app/chat.tsx`.
2. Register `input: ChatInput` on `components`.
3. Render `<Input />` in the layout, from `handle.props`.
4. Remove the form from `ChatScreen`.

The return type on `ChatInput` stops a circular type between the widget and the `ui` that registers it. Call `ui.useChatContext(handle)` only under `ui.Chat` or `ui.Provider`. A call outside that tree throws.

### Render markdown

`TextPart` from `@tanstack/ai-remix/ui` renders the content as plain text, with no markdown. To render markdown, render `part.content` in your own text part with the markdown library of your choice.

### Type a widget in its own file

Type the `handle.props` of a widget with `ToolProps`, `PartProps`, `InterruptProps`, `LayoutProps`, or `MessageProps`. Pass `typeof chatOptions` and a name. Share `chatOptions` from its own module:

```tsx ignore
import type { ToolProps } from '@tanstack/ai-remix/ui'
import type { Handle } from 'remix/ui'
import { chatOptions } from './chat-options'

export function WeatherTool(
  handle: Handle<ToolProps<typeof chatOptions, 'getWeather'>>,
) {
  return () => <strong>{handle.props.part.input?.city}</strong>
}
```

You now have a typed chat UI in Remix. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot). In Remix, `layout` gets `Messages`, `Interrupts`, `Queue`, and `Input`. If you render `Input` with no registered `input`, it renders nothing and warns once in development.

`createAppChat(handle, overrides)` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`.

### Approvals and generic interrupts

- A tool approval renders in the tool when you read the `interrupt` prop.
- To show it in the list instead, register a component under `interruptsComponents.tools` and render `Interrupts`.
- Generic interrupts always render in the list. `generic.fallback` renders an unregistered id and an unbound interrupt. If the copy must be different, branch on `interrupt.kind === 'unbound'`.

### Show queued messages

Register `queue` on `components`, then render `<Queue />` in the layout. A queue component gets one `item`. Call `item.cancelQueued()` to drop it.
