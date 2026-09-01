---
title: A chat box with no tools
id: ui-recipe-basic-chat
order: 1
description: "The smallest working React chat UI. A layout, a message, and a text part."
keywords:
  - tanstack ai
  - createChatHook
  - chat ui
  - example
---

Start here. This chat has no tools, no interrupts, and no styling.

You need three components: a `layout`, a `message`, and a `text` part. Leave the rest out.

## Server

```tsx
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const json: unknown = await request.json()
  if (typeof json !== 'object' || json === null || !('messages' in json)) {
    return new Response('Invalid body', { status: 400 })
  }
  const messages = json.messages
  const stream = chat({
    adapter: openaiText('gpt-5.6'),
    messages: Array.isArray(messages) ? messages : [],
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
  const chat = useAppChat()
  return <chat.AppChat />
}
```

Render `<ChatScreen />`. Type a message. The reply streams into the page.

## What each piece does

`layout` gets `Messages`, `Interrupts`, and `Input` as components. Render them where you want them. `Interrupts` is unused here, so leave it out.

`message` gets one message plus a `Parts` component. `Parts` walks that message and picks a component per part.

`partsComponents.text` renders text parts. `fallback` catches every part type you did not register. It returns `null` here, so anything else is silent.

## Next

- One tool that renders as raw JSON? See [format a tool](./format-a-tool).
- Need the user to approve something? See [tool approval](./tool-approval).
- Using Solid, Vue, or Svelte? The same shape applies. See [Solid](../solid), [Vue](../vue), or [Svelte](../svelte).
