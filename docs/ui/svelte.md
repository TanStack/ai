---
title: Svelte Chat UI
id: typed-headless-ui-svelte
order: 4
description: "Render a streaming chat in Svelte 5 with your own components. createChatHook types every tool, part, and interrupt, and snippets place the pieces."
keywords:
  - tanstack ai
  - createChatHook
  - svelte
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-svelte/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then creates a chat with `createAppChat()` and renders it with `UIChat`. You supply every visible component. There is no default markup or style.

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai

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

3. Create three widget files in `src/lib/chat/`. `Layout.svelte` places the message list:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { messages }: { messages: Snippet } = $props()
</script>

<section>
  {@render messages()}
</section>
```

`Message.svelte` wraps one message:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { MessageProps } from '@tanstack/ai-svelte/ui'
  import type { chatOptions } from './chat-ui'

  let {
    message,
    parts,
  }: MessageProps<typeof chatOptions> & { parts: Snippet } = $props()
</script>

<article data-role={message.role}>
  {@render parts()}
</article>
```

`Text.svelte` renders a text part:

```svelte
<script lang="ts">
  import type { PartProps } from '@tanstack/ai-svelte/ui'
  import type { chatOptions } from './chat-ui'

  let { part }: PartProps<typeof chatOptions, 'text'> = $props()
</script>

<p>{part.content}</p>
```

4. Create `src/lib/chat/chat-ui.ts`:

```ts ignore
import { fetchServerSentEvents } from '@tanstack/ai-svelte'
import { createChatHook } from '@tanstack/ai-svelte/ui'
import Layout from './Layout.svelte'
import Message from './Message.svelte'
import Text from './Text.svelte'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export const { createAppChat, ui } = createChatHook({
  options: chatOptions,
  components: { layout: Layout, message: Message },
  partsComponents: { text: Text },
})
```

5. Create `src/lib/chat/Chat.svelte`:

```svelte
<script lang="ts">
  import { UIChat } from '@tanstack/ai-svelte/ui'
  import { createAppChat, ui } from './chat-ui'

  const chat = createAppChat({ threadId: 'support-chat' })
  let draft = $state('')

  function send(event: SubmitEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    draft = ''
    void chat.sendMessage(text)
  }
</script>

<main>
  <UIChat {ui} {chat} />
  <form onsubmit={send}>
    <input bind:value={draft} />
    <button type="submit">Send</button>
  </form>
</main>
```

6. Render `<Chat />` and send a message.

The reply streams into the page as the model writes it.

## How it works

- `createChatHook` runs once, at module scope. It binds `chatOptions` to your components. It returns `ui`, the descriptor that `UIChat` reads.
- `createAppChat({ threadId })` creates one chat instance. `UIChat` renders that instance with your components.
- `layout` gets the `messages`, `interrupts`, `queue`, and `input` snippets. `message` gets one message plus the `parts` snippet.
- `partsComponents.text` renders text. A part type with no component renders nothing and warns once in development. Register `partsComponents.fallback` to catch those parts.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React, and the option names are the same in Svelte.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. Type its props with `ToolProps`:

```svelte
<script lang="ts">
  import type { ToolProps } from '@tanstack/ai-svelte/ui'
  import type { chatOptions } from './chat-ui'

  let { part }: ToolProps<typeof chatOptions, 'getWeather'> = $props()
</script>

{#if part.state === 'complete'}
  <p>{part.input?.city}: {part.output?.temperature}</p>
{:else}
  <p>Looking up weather</p>
{/if}
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` prop:

```svelte
<script lang="ts">
  import type { ToolProps } from '@tanstack/ai-svelte/ui'
  import type { chatOptions } from './chat-ui'

  let { part, interrupt }: ToolProps<typeof chatOptions, 'deleteFile'> =
    $props()
</script>

{#if interrupt?.status === 'pending'}
  <button onclick={() => interrupt?.resolveInterrupt(true)}>
    Delete {part.input?.path}
  </button>
{:else}
  <p>{part.input?.path}</p>
{/if}
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. Full example: [Ask before a tool runs](./recipes/tool-approval).

### Ask the user your own question

Define the question with `defineInterrupt`. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render the `interrupts` snippet in the layout:

```svelte
<script lang="ts">
  import type { InterruptProps } from '@tanstack/ai-svelte/ui'
  import type { chatOptions } from './chat-ui'

  let { interrupt }: InterruptProps<typeof chatOptions, 'choosePlan'> =
    $props()
</script>

<button onclick={() => interrupt.resolveInterrupt('pro')}>
  {interrupt.payload?.title}
</button>
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as a prop. Import `ui` and call `ui.useChatContext()` inside the widget. This also moves the composer into the layout. Create `Input.svelte`:

```svelte
<script lang="ts">
  import { ui } from './chat-ui'

  const chat = ui.useChatContext()
  let draft = $state('')

  function send(event: SubmitEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    draft = ''
    void chat.sendMessage(text)
  }
</script>

<form onsubmit={send}>
  <input bind:value={draft} disabled={chat.isLoading} />
  <button type="submit">Send</button>
</form>
```

Register it as `components.input`. Then render `{@render input()}` in `Layout.svelte`, and remove the form from `Chat.svelte`.

Call `ui.useChatContext()` only inside `UIChat` or `UIProvider`. A call outside that tree throws.

### Render markdown

`@tanstack/ai-svelte/ui` has no `TextPart` component. Render `part.content` in your own text part, with the markdown library of your choice.

### Type a widget in its own file

Every widget above is already in its own file. Type its `$props()` with `ToolProps`, `PartProps`, `InterruptProps`, or `MessageProps`. Pass `typeof chatOptions` and a name.

You now have a typed chat UI in Svelte. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot). In Svelte, components place content with snippets:

- `layout`: the `messages`, `interrupts`, `queue`, and `input` snippets.
- `message`: the `message` prop and the `parts` snippet.

`createAppChat()` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`.

### Approvals and generic interrupts

- A tool approval renders in the tool when you read the `interrupt` prop.
- To show it in the list instead, register a component under `interruptsComponents.tools` and render the `interrupts` snippet.
- Generic interrupts always render in the list. `generic.fallback` renders an unregistered id and an unbound interrupt. If the copy must be different, branch on `interrupt.kind === 'unbound'`.

### Show queued messages

Register `queue` on `components`, then render `{@render queue()}` in the layout. A queue component gets one `item`. Call `item.cancelQueued()` to drop it.
