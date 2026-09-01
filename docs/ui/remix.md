---
title: Remix Chat UI
id: typed-headless-ui-remix
order: 7
description: "Build a typed, headless Remix 3 chat UI with createChatHook. Widgets are Remix setup functions."
keywords:
  - tanstack ai
  - createChatHook
  - remix
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-remix`. Import the UI factory from `@tanstack/ai-remix/ui`. Call `createChatHook({ options, ...components })` once at module scope. Your app calls `createAppChat(handle)` in a Remix setup function. Render `<ui.Chat chat={chat} />`.

The factory needs a `toolsComponents` entry for every tool name in `chatOptions`. It also needs an `interruptsComponents.generic` entry for every interrupt id. `generic.fallback` is optional. Widgets go in `components`, `partsComponents`, `toolsComponents`, and `interruptsComponents`, the same way Form and Table register components.

Each widget is a Remix setup function. Read props from `handle.props`. If a widget needs live chat, call `useChatContext(handle)` in setup.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

The [chat UI recipes](./recipes/index) show the same option groups one at a time. The code there is React, and the shape carries over.

## Client

```tsx ignore
import { fetchServerSentEvents } from '@tanstack/ai-remix'
import {
  createChatHook,
  type LayoutProps,
  type MessageProps,
  type PartProps,
  type ToolProps,
} from '@tanstack/ai-remix/ui'
import { toolDefinition } from '@tanstack/ai'
import { clientEntry, type Handle } from 'remix/ui'
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

const { createAppChat, ui } = createChatHook({
  options: chatOptions,
  components: {
    layout(handle: Handle<LayoutProps<typeof chatOptions>>) {
      return () => {
        const { Messages, Interrupts, Queue } = handle.props
        return (
          <main>
            <Messages />
            <Interrupts />
            <Queue />
          </main>
        )
      }
    },
    message(handle: Handle<MessageProps<typeof chatOptions>>) {
      return () => {
        const { Parts } = handle.props
        return (
          <article>
            <Parts />
          </article>
        )
      }
    },
  },
  partsComponents: {
    fallback(handle: Handle<PartProps<typeof chatOptions>>) {
      return () => <span>{handle.props.part.type}</span>
    },
  },
  toolsComponents: {
    getWeather(handle: Handle<ToolProps<typeof chatOptions, 'getWeather'>>) {
      return () => <strong>{handle.props.part.input?.city}</strong>
    },
  },
})

export const ChatScreen = clientEntry(
  import.meta.url,
  function ChatScreen(handle: Handle) {
    const chat = createAppChat(handle)
    return () => <ui.Chat chat={chat} />
  },
)
```

`layout` receives these components. Render them as tags, not as calls:

- `Messages`
- `Interrupts`
- `Queue`
- `Input`

Register `queue` on `components` to draw pending sends. Call `item.cancelQueued()` on a queue item to drop it. `message` receives `Parts`. A tool with an approval receives prop `interrupt`.

## Type a component in its own file

Type the `handle.props` of a tool file with `ToolProps`. Share the same `chatOptions` module that you pass to `createChatHook`.

```tsx ignore
import type { ToolProps } from '@tanstack/ai-remix/ui'
import type { Handle } from 'remix/ui'
import { chatOptions } from './chat-options'

export function getWeather(handle: Handle<ToolProps<typeof chatOptions, 'getWeather'>>) {
  return () => <strong>{handle.props.part.input?.city}</strong>
}
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. If a component needs live chat, call `ui.useChatContext(handle)`.

## Read chat from `ui.useChatContext(handle)`

Import the same `ui` kit in a child file. Call `ui.useChatContext(handle)` only under `ui.Chat` or `ui.Provider`. Call it in setup, not in the render function.

```tsx ignore
import { ui } from './chat-ui'
import type { Handle } from 'remix/ui'

function MessageCount(handle: Handle) {
  const chat = ui.useChatContext(handle)
  return () => <p>{chat.messages.length} messages</p>
}
```

`createAppChat(handle)` owns the state. `ui.useChatContext(handle)` reads the instance you passed into `ui.Chat`. A call outside that tree throws.

## Interrupts

Tool approvals sit in the tool when you read the `interrupt` prop. Put a component on `interruptsComponents.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interruptsComponents.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. If the copy must differ, branch on `interrupt.kind === 'unbound'`.

The full map is on the [React page](./react).
