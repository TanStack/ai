---
title: Solid Chat UI
id: typed-headless-ui-solid
order: 2
description: "Build a typed, headless Solid chat UI with createUI. Accessors stay tracked. Your app owns useChat."
keywords:
  - tanstack ai
  - createUI
  - solid
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-solid-ui`, then call `createUI(chatOptions)` once at module scope. Do not destructure reactive props.

`defineComponents` needs a `tools` entry for every tool name in `chatOptions`. It also needs an `interrupts.generic` entry for every interrupt id. `generic.fallback` is optional.

The server route matches the [React page](./react). Use `gpt-5.2` on the OpenAI text adapter.

## Client

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { createUI } from '@tanstack/ai-solid-ui'
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

const UI = createUI(chatOptions)

const components = UI.defineComponents({
  layout: (props) => (
    <>
      {props.renderMessages()}
      {props.renderInterrupts()}
      {props.renderInput()}
    </>
  ),
  message: (props) => <article>{props.renderParts()}</article>,
  parts: {
    fallback: (props) => <span>{props.part.type}</span>,
  },
  tools: {
    getWeather: (props) => <strong>{props.part.input?.city}</strong>,
  },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

## Type a component in its own file

Use `ToolProps` the same way as React. Keep the `props` object so Solid can track it.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-solid'
import { createUI, type ToolProps } from '@tanstack/ai-solid-ui'
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

const UI = createUI(chatOptions)

export const components = UI.defineComponents({
  layout: (props) => props.renderMessages(),
  message: (props) => <article>{props.renderParts()}</article>,
  parts: { fallback: () => null },
  tools: { getWeather: WeatherTool },
})
```

Part components use `PartProps<typeof chatOptions, 'text'>`. Then `part` is already a text part.

Interrupt components use `InterruptProps<typeof chatOptions, 'choosePlan'>`. Then `interrupt.payload` matches the definition.

Mapped components do not receive `chat` as a prop. Call `UI.useChat()` when a component needs live chat. That call opts the component into chat updates. Nested children can call it too.

## Read chat from `UI.useChat()`

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { createUI } from '@tanstack/ai-solid-ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const UI = createUI(chatOptions)

function StatusLine() {
  const chat = UI.useChat()
  return <p>{chat.messages.length} messages</p>
}

const components = UI.defineComponents({
  layout: (props) => (
    <>
      <StatusLine />
      {props.renderMessages()}
    </>
  ),
  message: (props) => <article>{props.renderParts()}</article>,
  parts: { fallback: () => null },
})

export function ChatScreen() {
  const chat = useChat(chatOptions)
  return <UI.Chat chat={chat} components={components} />
}
```

Call `UI.useChat()` only inside `UI.Chat` or `UI.Provider`.

## Interrupts

Tool approvals sit in the tool when you read `props.interrupt`. Put a component on `interrupts.tools` to send that approval to the list instead. Generic interrupts always sit in the list under `interrupts.generic`: `{ choosePlan, fallback }`. An unbound interrupt uses `fallback`. Branch on `interrupt.kind === 'unbound'` if the copy must differ.

The full map is on the [React page](./react).

Manual list: `<UI.Messages>{(messages) => <span>{messages().length}</span>}</UI.Messages>`.

Pass `props.chat`, `props.part`, and `props.renderParts()` without destructure.
