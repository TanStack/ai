---
title: Chat UI packages
id: migrate-create-ui
order: 5
description: "Move from @tanstack/ai-*-ui to the framework /ui subpath. Call useChat and render Chat with a component map."
keywords:
  - tanstack ai
  - Chat
  - migration
  - deprecation
---

Change your import from `@tanstack/ai-react-ui` to `@tanstack/ai-react/ui`. Call `useChat(chatOptions)` and render `<Chat chat={chat} components={components} />`.

The same move applies to Solid, Vue, and Svelte.

> **Deprecated.** `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` re-export the new `/ui` subpath until each package's `1.0.0`. `npm install` prints a warning. Import from `/ui` in new code. Svelte never published a `*-ui` package. Use `@tanstack/ai-svelte/ui`.

## What changes

1. Chat UI lives on the framework package: `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, `@tanstack/ai-vue/ui`, `@tanstack/ai-svelte/ui`.
2. You call `useChat` or `createChat` yourself.
3. You pass a `components` map into `Chat`.
4. You supply every visible component. There is no default markup.

## Why

A separate `*-ui` package split chat UI from the framework package. The old `Chat` component also owned chat state and dropped configured types. `Chat` from `/ui` keeps types from your `chatOptions` and leaves state on `useChat`.

## Before

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { Chat, ChatMessages, ChatInput } from '@tanstack/ai-react-ui'

const connection = fetchServerSentEvents('/api/chat')

export function OldChat() {
  return (
    <Chat connection={connection}>
      <ChatMessages />
      <ChatInput />
    </Chat>
  )
}
```

## After

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { Chat, type ChatUIComponents } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const components = {
  layout: ({ renderMessages, renderInput }) => (
    <main>
      {renderMessages()}
      {renderInput()}
    </main>
  ),
  message: ({ renderParts }) => <article>{renderParts()}</article>,
  input: ({ chat }) => (
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
    </form>
  ),
  parts: { fallback: () => null },
} satisfies ChatUIComponents<typeof chatOptions>

export function NewChat() {
  const chat = useChat(chatOptions)
  return <Chat chat={chat} components={components} />
}
```

## Steps

1. Move `connection`, `tools`, and `interrupts` into a module-level `chatOptions` object.
2. Build a `components` map typed with `ChatUIComponents<typeof chatOptions>`.
3. Call `useChat(chatOptions)` in the screen component.
4. Render `<Chat chat={chat} components={components} />`.

Old orchestration exports stay importable from the deprecated `*-ui` packages until `1.0.0`.
