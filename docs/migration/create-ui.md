---
title: Migrate to createChatUI
id: migrate-create-ui
order: 5
description: "Move chat-state ownership out of the old Chat component and onto createChatUI with a typed component map."
keywords:
  - tanstack ai
  - createChatUI
  - migration
  - deprecation
---

The old `Chat` component owned chat state and lost configured types. `createChatUI` keeps types from your `chatOptions` and leaves `useChat` in your app.

This is a semantic migration. There is no codemod.

## What changes

1. You call `useChat` or `createChat` yourself.
2. You supply every visible component.
3. Tool inputs stay optional while they stream.
4. Tool approvals come from `chat.interrupts`.
5. Unknown runtime keys can use a fallback or render nothing.
6. `createChatUI()` must run at module scope so identity stays stable.

## Why

The old APIs drop configured types, keep unused properties, use a deprecated approval path, cover only part of the message protocol, and own chat state. Two orchestration models duplicate fixes.

## Minimum versions

- `@tanstack/ai-react/ui` 0.9.0
- `@tanstack/ai-solid/ui` 0.8.0
- `@tanstack/ai-vue/ui` 0.3.0
- `@tanstack/ai-svelte/ui` 0.2.0

Old orchestration exports stay importable until each package's `1.0.0`. `TextPart` and `ThinkingPart` stay supported.

## Before

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { Chat, ChatMessages, ChatInput } from '@tanstack/ai-react/ui'

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
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  chatComponents: {
    layout: ({ renderMessages, renderInput }) => (
      <main>
        {renderMessages()}
        {renderInput()}
      </main>
    ),
    message: ({ renderParts }) => <article>{renderParts()}</article>,
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
        </form>
      )
    },
    parts: { fallback: () => null },
  },
})

export function NewChat() {
  const chat = useAppChat({ threadId: 'support-1' })
  return <chat.AppChat />
}
```

## Steps

1. Move `connection`, `tools`, and `interrupts` into a module-level `chatOptions` object.
2. Call `createChatHook({ options: chatOptions, chatComponents: { layout, message, parts, tools, interrupts } })` next to that object.
3. Call the bound `useAppChat` from `createChatHook` in the screen component.
4. Register `layout`, `message`, `parts`, `tools`, and `interrupts` on `chatComponents`. This matches Form and Table.
5. Render `<chat.AppChat />`.

## Gotchas

- A shared `chatOptions` variable does not need `as const`.
- A mapped tool can read `interrupt` and render the approval itself. That approval stays off the list. A component on `interrupts.tools` uses the list.
- Generic interrupts live under `interrupts.generic`: a registered id such as `choosePlan`, plus `fallback`. Unbound interrupts use `fallback`.
- TypeScript requires a `tools` component for every tool name and an `interrupts.generic` component for every interrupt id. `generic.fallback` is optional.
- Matched `tool-result` parts are hidden in automatic traversal. Unmatched results stay visible.
- Nested providers use the nearest chat instance.

See the [React UI guide](../ui/react) for a full map.
