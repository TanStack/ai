---
title: Chat UI packages
id: migrate-create-ui
order: 5
description: "Move from @tanstack/ai-*-ui to the framework /ui subpath, then call createChatHook and render chat.AppChat."
keywords:
  - tanstack ai
  - createChatHook
  - createChatUI
  - migration
  - deprecation
---

Change your import from `@tanstack/ai-react-ui` to `@tanstack/ai-react/ui`. Then call `createChatHook({ options, chatComponents })` and render `<chat.AppChat />`.

The same move applies to Solid, Vue, and Svelte.

> **Deprecated.** `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` re-export the new `/ui` subpath until each package's `1.0.0`. `npm install` prints a warning. Import from `/ui` in new code. Svelte never published a `*-ui` package. Use `@tanstack/ai-svelte/ui`.

## What changes

1. Chat UI lives on the framework package: `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, `@tanstack/ai-vue/ui`, `@tanstack/ai-svelte/ui`.
2. You call `createChatHook({ options, chatComponents })` once at module scope.
3. You call `useAppChat()` in the screen (Svelte: `createAppChat()`).
4. You render `<chat.AppChat />` (Vue and Svelte pass `ui` into `UIChat`).
5. You supply every visible component. There is no default markup.

This is a mechanical import change plus a factory rename. There is no codemod.

## Why

A separate `*-ui` package split chat UI from the framework package. Form uses `createFormHook` on `@tanstack/react-form`. Table uses `createTableHook` on `@tanstack/react-table`. Chat now uses the same shape on `@tanstack/ai-react/ui`.

The old `Chat` component also owned chat state and dropped configured types. `createChatHook` keeps types from your `chatOptions`.

## Minimum versions

New imports:

- `@tanstack/ai-react` (next minor) `/ui`
- `@tanstack/ai-solid` (next minor) `/ui`
- `@tanstack/ai-vue` (next minor) `/ui`
- `@tanstack/ai-svelte` (next minor) `/ui`

Deprecated re-exports, removed in `1.0.0`:

- `@tanstack/ai-react-ui` 0.9.0
- `@tanstack/ai-solid-ui` 0.8.0
- `@tanstack/ai-vue-ui` 0.3.0

Old orchestration exports (`Chat` with a `connection` prop) stay importable until `1.0.0`. `TextPart` and `ThinkingPart` stay supported.

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
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  chatComponents: {
    layout: ({ Messages, Input }) => (
      <main>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ Parts }) => <article><Parts /></article>,
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

1. Replace `@tanstack/ai-react-ui` with `@tanstack/ai-react/ui`. Solid and Vue use the same swap. Svelte has no `*-ui` package. Import `@tanstack/ai-svelte/ui`.
2. Move `connection`, `tools`, and `interrupts` into a module-level `chatOptions` object.
3. Call `createChatHook({ options: chatOptions, chatComponents })` next to that object.
4. Call `useAppChat` in the screen component. Pass `threadId` here when you need more than one chat.
5. Render `<chat.AppChat />`. On Vue and Svelte, pass `ui` into `UIChat`.

Register `layout`, `message`, `parts`, `tools`, and `interrupts` on `chatComponents`. This matches Form `fieldComponents` and Table `cellComponents`.

## Gotchas

Do now:

- The deprecated packages re-export `/ui`. An old import path still compiles. Switch the import so the warning goes away.
- `useChat` is not re-exported from the shim. Import it from `@tanstack/ai-react` (or the matching framework package).
- Lower-level `createChatUI(options, chatComponents)` still exists on `/ui` for manual traversal. Prefer `createChatHook` for screens.

Types and interrupts:

- A shared `chatOptions` variable does not need `as const`.
- A mapped tool can read `interrupt` and render the approval itself. That approval stays off the list. A component on `interrupts.tools` uses the list.
- Generic interrupts live under `interrupts.generic`: a registered id such as `choosePlan`, plus `fallback`. Unbound interrupts use `fallback`.
- TypeScript requires a `tools` component for every tool name and an `interrupts.generic` component for every interrupt id. `generic.fallback` is optional.
- Nested providers use the nearest chat instance.

## Coexistence

Old `*-ui` packages and new `/ui` imports can live in the same app until `1.0.0`. Do not mix them in one chat tree. Pick one factory per screen.

See the [React UI guide](../ui/react) for a full map.
