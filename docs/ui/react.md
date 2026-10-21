---
title: React Chat UI
id: typed-headless-ui-react
order: 1
description: "Render a streaming chat in React with your own components. createChatHook types every tool, part, and interrupt from your chat options."
keywords:
  - tanstack ai
  - createChatHook
  - react
  - headless ui
  - useAppChat
  - ToolProps
---

You have a streaming chat and you want it to look like your app. You also want tool calls and approvals typed, with no casts.

`createChatHook` from `@tanstack/ai-react/ui` binds your chat options and your components once. Each screen then renders the chat with one hook call. You supply every visible component. There is no default markup or style.

> [!NOTE]
> Upgrading from `@tanstack/ai-react-ui`? Read [Upgrade to 1.0](../migration/v1#chat-ui-components).

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

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
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages }) => (
      <section>
        <Messages />
      </section>
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
- `useAppChat()` creates one chat instance. `chat.AppChat` renders that instance with your components.
- `layout` places the message list. `message` wraps one message. `Parts` picks a component for each part of that message.
- `partsComponents.text` renders text. `fallback` catches every part type that you did not register.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. `part.input` and `part.output` are typed from the tool schemas.

```tsx ignore
toolsComponents: {
  getWeather: ({ part }) => {
    if (part.state !== 'complete') return <p>Looking up weather</p>
    return (
      <p>
        {part.input?.city}: {part.output?.temperature}
      </p>
    )
  },
},
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` prop:

```tsx ignore
toolsComponents: {
  deleteFile: ({ part, interrupt }) =>
    interrupt?.status === 'pending' ? (
      <button onClick={() => interrupt.resolveInterrupt(true)}>
        Delete {part.input?.path}
      </button>
    ) : (
      <p>{part.input?.path}</p>
    ),
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
    choosePlan: ({ interrupt }) => (
      <button onClick={() => interrupt.resolveInterrupt('pro')}>
        {interrupt.payload?.title}
      </button>
    ),
    fallback: ({ interrupt }) => <p>{interrupt.reason}</p>,
  },
},
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as a prop. Call `useChatContext()` inside the widget. This also moves the composer into the layout: register it as `input`, then render `Input`.

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
          <input name="message" disabled={chat.isLoading} />
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
    message: ({ Parts }) => (
      <article>
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

Call `useChatContext()` only inside `chat.AppChat`. A call outside that tree throws.

### Render markdown

Model replies arrive as markdown. Register `TextPart` from `@tanstack/ai-react/ui` as the text part:

```tsx ignore
import { TextPart } from '@tanstack/ai-react/ui'

partsComponents: {
  text: ({ part }) => <TextPart content={part.content} />,
  fallback: () => null,
},
```

`TextPart` uses [TanStack Markdown](https://tanstack.com/markdown). It escapes raw HTML and removes executable URLs. To color fenced code, read [Highlight markdown code](./markdown).

### Type a widget in its own file

Move a widget to its own file and type its props with `ToolProps`, `PartProps`, or `InterruptProps`. Pass `typeof chatOptions` and a name:

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook, type ToolProps } from '@tanstack/ai-react/ui'
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

export function WeatherTool({
  part,
}: ToolProps<typeof chatOptions, 'getWeather'>) {
  if (part.state !== 'complete') return <p>Looking up weather</p>
  return (
    <p>
      {part.input?.city}: {part.output?.temperature}
    </p>
  )
}

export const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages }) => <Messages />,
    message: ({ Parts }) => (
      <article>
        <Parts />
      </article>
    ),
  },
  partsComponents: { fallback: () => null },
  toolsComponents: { getWeather: WeatherTool },
})
```

Put `chatOptions` in a shared module so every widget file can import its type.

You now have a typed chat UI in React. Each widget is your own component.

## Advanced

### Every widget slot

| Config key                     | Keys                                                  | Props                                                  |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| `components`                   | `layout`, `message`, `input`, `queue`                 | `LayoutProps`, `MessageProps`, `InputProps`, `QueueProps` |
| `partsComponents`              | a part key, or `fallback`                             | `PartProps<typeof chatOptions, 'text'>`                |
| `toolsComponents`              | each tool name in `chatOptions.tools`                 | `ToolProps<typeof chatOptions, 'getWeather'>`          |
| `interruptsComponents.tools`   | an approval tool name                                 | `InterruptProps<typeof chatOptions, 'deleteFile'>`     |
| `interruptsComponents.generic` | each interrupt id, plus an optional `fallback`        | `InterruptProps<typeof chatOptions, 'choosePlan'>`     |
| `subagentsComponents`          | each subagent name                                    | `SubagentProps`. See [Subagents](../chat/subagents)    |

Part keys:

- `text`, `thinking`, `activity`
- `image`, `audio`, `video`, `document`
- `toolCall`, `toolResult`
- `structuredOutput`, `uiResource`, `subagent`

`layout` gets these components. Render them as tags, such as `<Messages />`:

- `Messages`, `Interrupts`, `Queue`, `Subagents`
- `Input`, only when you register `input`. Without it, `<Input />` is a compile error.

`useAppChat()` takes per-instance options: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools`, `interrupts`, and `outputSchema` on `chatOptions`. Two instances with different `threadId` values keep separate histories:

```tsx ignore
const chat = useAppChat({ threadId: 'support-1' })
```

### Tool part states

| `part.state`         | Meaning                                          |
| -------------------- | ------------------------------------------------ |
| `awaiting-input`     | The call started. No arguments yet.              |
| `input-streaming`    | The model is still writing the arguments.        |
| `input-complete`     | The arguments are final.                         |
| `approval-requested` | The tool waits for approval.                     |
| `approval-responded` | The user approved or denied.                     |
| `complete`           | The result arrived.                              |
| `error`              | The call failed.                                 |

A tool component also gets `result`, the matching tool-result part, when one exists.

### Approval next to the tool, or in the list

A tool with `needsApproval: true` renders its approval in one of two places:

- **Next to the tool.** Read `interrupt` in the tool component. This is the default.
- **In the list.** Register a component under `interruptsComponents.tools` with the tool name. Render `Interrupts` in the layout. The approval then leaves the message.

Do not do both for one tool. A list approval component reads `interrupt.originalArgs`, typed from the tool `inputSchema`.

### Generic interrupts and `fallback`

Generic interrupts always render in `Interrupts`. They never render inside a tool. `interruptsComponents.generic.fallback` renders:

- an interrupt id that you did not register.
- an unbound interrupt. Something outside this chat owns it, so it cannot be resolved here.

If the copy for an unbound interrupt must be different, branch on `interrupt.kind === 'unbound'`.

### Show queued messages

By default, a message sent while a run streams waits in a [queue](../chat/queueing). Register `queue` on `components` and render `Queue` in the layout. Each item has `cancelQueued()` bound to it:

```tsx ignore
components: {
  layout: ({ Messages, Queue }) => (
    <main>
      <Messages />
      <Queue />
    </main>
  ),
  message: ({ Parts }) => <Parts />,
  queue: ({ item }) => (
    <div>
      {typeof item.content === 'string' ? item.content : 'Queued'}
      <button type="button" onClick={() => item.cancelQueued()}>
        Cancel
      </button>
    </div>
  ),
},
```

Type a queue item with `QueueProps<typeof chatOptions>`.

### List `input` before `layout`

If `input` is an inline `function` expression written after `layout`, TypeScript cannot see that an input is registered. Then `Input` is missing from the layout props.

To prevent this, do one of these:

- Put `input` before `layout`.
- Use an arrow function or a named component for `input`.

If it still slips through, `<Input />` without a registered `input` warns once in development.

### Widgets in other files

A widget file that imports `useChatContext` from the factory module makes a circular import. To prevent this, call `createChatHookContexts()` in its own module first:

```tsx ignore
// chat-contexts.ts
import { createChatHookContexts } from '@tanstack/ai-react/ui'

export const { chatContext, partContext, interruptContext, useChatContext } =
  createChatHookContexts()
```

Pass `chatContext`, `partContext`, and `interruptContext` to `createChatHook` under `context`. Widget files then import `useChatContext` from the contexts module.

Part and interrupt widgets get `part` and `interrupt` as props. Do not read those from context.

### Walk messages yourself

`createChatUI` is the lower-level kit. If you map messages yourself, use it. It takes the same component maps:

```tsx group=manual-traversal
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { createChatUI } from '@tanstack/ai-react/ui'
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

const UI = createChatUI(chatOptions, {
  components: {
    layout: ({ Messages }) => <Messages />,
    message: ({ Parts }) => <article><Parts /></article>,
  },
  partsComponents: {
    text: ({ part }) => <p>{part.content}</p>,
    fallback: () => null,
  },
  toolsComponents: {
    getWeather: ({ part }) => <p>{part.input?.city}</p>,
  },
})

export function ManualChat() {
  const chat = useChat(chatOptions)
  return (
    <UI.Provider chat={chat}>
      <UI.Messages>
        {(messages) =>
          messages.map((message) => (
            <UI.Message key={message.id} message={message}>
              {(parts) =>
                parts.map((part, index) => (
                  <span key={index}>{part.key}</span>
                ))
              }
            </UI.Message>
          ))
        }
      </UI.Messages>
    </UI.Provider>
  )
}
```

You can also pick a registered widget at the call site:

```tsx group=manual-traversal
import type { MessageProps } from '@tanstack/ai-react/ui'

function PickedWidgets({
  message,
}: {
  message: MessageProps<typeof chatOptions>['message']
}) {
  return (
    <UI.Message message={message}>
      {(parts) =>
        parts.map((part, index) => (
          <UI.Part key={index} part={part}>
            {(p) => (part.key === 'toolCall' ? <p.getWeather /> : <p.Render />)}
          </UI.Part>
        ))
      }
    </UI.Message>
  )
}
```

- `p.getWeather` and `p.text` are the widgets that you passed to the factory.
- `p.Render` renders this one part the automatic way.
- `UI.Input` exists when you register `input`.

An unknown tool name at runtime warns once in development and renders nothing.

### `TextPart` options

- `highlighter`: a synchronous `CodeHighlighter`. Its output is trusted HTML, so use `createTanStackMarkdownHighlighter` or another highlighter that escapes source text.
- `extensions`: more TanStack Markdown extensions. The streaming extension is always on.
- `components`: a tag-name map with normal HTML props (`href`, `className`). `inline` and `node` are not passed.
- `className`, `userClassName`, `assistantClassName`: classes for the wrapper. Pass `role` to apply the role class.

```tsx
import { TextPart } from '@tanstack/ai-react/ui'

export function Reply({ content }: { content: string }) {
  return (
    <TextPart
      content={content}
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    />
  )
}
```

If you still pass `remarkPlugins`, `rehypePlugins`, or `disableDefaultPlugins`, read [TextPart markdown](../migration/text-part-markdown).
