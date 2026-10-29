---
title: A chat box with no tools
id: ui-recipe-basic-chat
order: 1
description: "The smallest React chat UI that works: a layout, a message, a text part, and a composer."
keywords:
  - tanstack ai
  - createChatHook
  - chat ui
  - example
---

This recipe is a chat UI with four components: `layout`, `message`, `text`, and `input`. It has no tools, no interrupts, and no styles.

For a full TanStack Start app with your own API key, read the [Basic Chat](../../tutorials/basic-chat) tutorial.

## Server

Put `OPENAI_API_KEY` in your server environment. Then add a `POST` route at `/api/chat`:

```tsx
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

## Client

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

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
          <input name="message" />
          <button type="submit">Send</button>
        </form>
      )
    },
    layout: ({ Messages, Input }) => (
      <main>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ message, Parts }) => (
      <article data-role={message.role}>
        <Parts />
      </article>
    ),
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
})

export function ChatScreen() {
  const chat = useAppChat({ threadId: 'support-chat' })
  return <chat.AppChat />
}
```

Render `<ChatScreen />` and type a message. The reply streams into the page.

## How it works

- `layout` gets `Messages`, `Interrupts`, and `Input` as components. Render them where you want them. This chat has no interrupts, so it leaves `Interrupts` out.
- `message` gets one message plus a `Parts` component. `Parts` picks a component for each part of that message.
- `partsComponents.text` renders text parts. `fallback` catches every part type that you did not register. Here it returns `null`, so other parts render nothing.
- `input` reads the chat with `useChatContext()`. It comes before `layout`, so TypeScript sees that an input is registered and adds `Input` to the layout props.

## Next

- A tool that shows raw JSON? Read [Make a tool look right](./format-a-tool).
- Colored code in replies? Read [Highlight markdown code](../markdown).
