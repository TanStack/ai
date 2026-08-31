---
title: Solid Chat UI
id: typed-headless-ui-solid
order: 2
description: "Build a typed, headless Solid chat UI with createChatHook. Accessors stay tracked."
keywords:
  - tanstack ai
  - createChatHook
  - solid
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-solid`. Import the UI factory from `@tanstack/ai-solid/ui`. Call `createChatHook({ options, chatComponents })` once at module scope. Your app calls `useAppChat()` to create the instance. Render `<chat.AppChat />`. Do not destructure reactive props.

> **Deprecated.** Do not install `@tanstack/ai-solid-ui`. That package re-exports this subpath until 1.0.0. See [Chat UI packages](../migration/create-ui).

The factory needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional. Pass widgets in `chatComponents`, the same way Form and Table register components.

The server route matches the [React page](./react). Use `gpt-5.6` on the OpenAI text adapter.

## Client

```tsx
import { createSignal } from 'solid-js'
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createChatHook } from '@tanstack/ai-solid/ui'
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

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  chatComponents: {
  layout: (props) => (
    <>
      <props.Messages />
      <props.Interrupts />
      <props.Input />
    </>
  ),
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
        <input onInput={(event) => setDraft(event.currentTarget.value)} value={draft()} />
        <button type="submit">Send</button>
      </form>
    )
  },
  message: (props) => <article><props.Parts /></article>,
  parts: {
    fallback: (props) => <span>{props.part.type}</span>,
  },
  tools: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
  },
  },
})

export function Support() {
  const chat = useAppChat({ threadId: 'support-1' })
  return <chat.AppChat />
}
```

`layout` receives `props.Messages`, `props.Interrupts`, and `props.Input` as components. `Input` is only present when the config registers an `input`.

> **Declare `input` outside the config.** An inline `function` expression (`input: function Input() { ... }`) stops TypeScript inferring that an input is registered, and `Input` goes missing from the layout props. Name the component first and reference it, or use an arrow.

## Type a component in its own file

Use `ToolProps` the same way as React. Keep the `props` object so Solid can track it.

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
  chatComponents: {
    layout: (props) => <props.Messages />,
    message: (props) => <article><props.Parts /></article>,
    parts: { fallback: () => null },
    tools: { getWeather: WeatherTool },
  },
})
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. Call `useChatContext()` when a component needs live chat. That call opts the component into chat updates. Nested children can call it too.

## Read chat from `useChatContext()`

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createChatHook } from '@tanstack/ai-solid/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

function StatusLine() {
  const chat = useChatContext()
  return <p>{chat.messages.length} messages</p>
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  chatComponents: {
    layout: (props) => (
      <>
        <StatusLine />
        <props.Messages />
      </>
    ),
    message: (props) => <article><props.Parts /></article>,
    parts: { fallback: () => null },
  },
})

export function ChatScreen() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

Call `useChatContext()` only inside `AppChat` or `Provider`.

## Interrupts

Tool approvals sit in the tool when you read `props.interrupt`. Put a component on `interrupts.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interrupts.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).

Manual list: `<UI.Messages>{(messages) => <span>{messages().length}</span>}</UI.Messages>`.

Pass `props.chat`, `props.part`, and `props.Parts` without destructure.
