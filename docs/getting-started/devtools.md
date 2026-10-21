---
title: Devtools
id: devtools
order: 3
description: "See what your TanStack AI app does while it runs. The devtools panel shows live messages, runs, tool call inputs and outputs, memory, and errors."
keywords:
  - tanstack ai
  - devtools
  - debugging
  - tool inspection
  - chat inspector
  - react devtools
  - observability
---

Your chat gives a strange answer, and you cannot see why. Which messages did the model get? Which tool ran, with which input? What came back?

The TanStack AI devtools panel shows you this while the app runs. It is a plugin for TanStack Devtools. This takes about 3 minutes.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: @tanstack/react-ai-devtools @tanstack/react-devtools
solid: @tanstack/solid-ai-devtools @tanstack/solid-devtools
preact: @tanstack/preact-ai-devtools @tanstack/preact-devtools
svelte: @tanstack/svelte-ai-devtools @tanstack/svelte-devtools

<!-- ::end:tabs -->

## 2. Add the panel

Render `TanStackDevtools` with the AI plugin in your app root. Set `connectToServerBus: true` so the panel also gets events from the server.

React:

```tsx
import { TanStackDevtools } from '@tanstack/react-devtools'
import { aiDevtoolsPlugin } from '@tanstack/react-ai-devtools'

const App = () => {
  return (
    <>
      <TanStackDevtools
        plugins={[aiDevtoolsPlugin()]}
        eventBusConfig={{
          connectToServerBus: true,
        }}
      />
    </>
  )
}
```

Svelte:

```svelte
<script lang="ts">
import { aiDevtoolsPlugin } from '@tanstack/svelte-ai-devtools'
import { TanStackDevtools } from '@tanstack/svelte-devtools'

const plugins = [aiDevtoolsPlugin()]
</script>

<TanStackDevtools
  {plugins}
  eventBusConfig={{
    connectToServerBus: true,
  }}
/>
```

If you already use other devtools plugins, add `aiDevtoolsPlugin()` to the same `plugins` array.

## 3. Start the server bus (without Vite)

`connectToServerBus: true` needs a WebSocket/SSE server on port 4206. With Vite, `@tanstack/devtools-vite` starts it for you. Skip this step.

With Next.js or another bundler, start `ServerEventBus` when the server boots. In Next.js, put this in `instrumentation.ts`:

```ts ignore
export async function register() {
  if (
    process.env['NEXT_RUNTIME'] === 'nodejs' &&
    process.env.NODE_ENV === 'development'
  ) {
    const { ServerEventBus } = await import(
      '@tanstack/devtools-event-bus/server'
    )
    const bus = new ServerEventBus()
    await bus.start()
  }
}
```

## 4. Open the panel

Start the app, open the devtools, and open the AI panel. Send a chat message. The panel lists your chat hook, and the timeline fills with the run, its events, and any tool calls.

## What you see

- **Hook dashboard:** every active TanStack AI hook on the page. This includes chat, structured output, image, video, audio, speech, transcription, and summarize hooks.
- **Run timeline:** user turns, linked runs, stream events, client snapshots, and server-only events, by `threadId` and `runId`.
- **Tool calls:** the input and output of each tool call.
- **Chat state:** the live messages and the message history.
- **Errors:** errors and exceptions in AI calls.

Also there when you need it:

- **Tool fixture replay:** build a tool payload from the input schema of a tool, and add the result to the chat. See [Tool Fixtures](#tool-fixtures).
- **Memory inspector:** for chats with `memoryMiddleware`, see what memory recalled and added each turn. See [Memory Inspector](#memory-inspector).

## How it works

Events come from two places:

- **The client.** The headless client sends the state that the browser can see.
- **The server.** The server sends details that never reach the client, such as middleware and provider stream events. `devtoolsMiddleware` runs inside every `chat()` call and sends these to the server bus. The bus forwards them to the panel.

Each event has a source descriptor and a stable envelope id. The panel uses them to link related events and to skip duplicates.

## Advanced

### Hook dashboard

The panel listens for active TanStack AI clients and shows them in the left sidebar.

- A hook registers when it is created and sends a snapshot at once.
- It sends a new snapshot when the panel opens or asks for state. So the hooks show up even if you open the panel after the app rendered.

Each hook entry shows its type, lifecycle, message count, run count, and the latest linked `threadId`. Select a hook to open its full timeline.

Chat hooks use a view by turn. A user message wraps every run and event that happened while the model answered that turn. The details view also shows small client and server state snapshots between runs, so you can see what changed.

### Naming hooks

When a page has more than one AI hook, give each one a label with `devtools.name`. The name changes only the label. Hook type, framework, thread id, and run links still come from the TanStack AI client.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function SupportChat() {
  const chat = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    devtools: {
      name: 'Support Chat',
    },
  })

  // render your chat UI with `chat.messages`, `chat.sendMessage`, etc.
}
```

The same option works for the generation hooks:

```tsx
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function ImageStudio() {
  const image = useGenerateImage({
    threadId: 'generation-hooks:useGenerateImage',
    connection: fetchServerSentEvents('/api/image'),
    devtools: {
      name: 'Image Studio',
    },
  })

  // render your image generation UI with `image.generate` and `image.result`
}
```

### Tool Fixtures

When a `useChat` hook gets tools, the panel lists the tools and their schemas. For inputs that use a Standard Schema, the panel shows a small form, so you can build a tool call payload without writing JSON by hand.

When you apply a fixture, the panel adds the tool call and its result to the real chat messages of that hook. The panel saves fixtures in browser localStorage, under the AI devtools namespace. They are there the next time you open the panel.

### Memory Inspector

When a chat uses [`memoryMiddleware`](../memory/overview.md), the **Memory** tab of the hook shows what the server memory backend did for that conversation. The tab groups the data by scope (session):

- **Operations timeline:** the recall for each turn. It shows the query, how many fragments came back, how many characters went into the system prompt, if memory tools were shown to the model, and how long the recall took.
- **Stored records and facts:** the current contents of the memory store for the scope. This needs an adapter with the optional `inspect`/`listFacts` methods. The built-in `inMemory()` and `redis()` adapters have them. Adapters without them still show the operations timeline.

Memory runs on the server. Its state gets to the panel over the chat stream, as a `CUSTOM` event that the client sends again, the same way generation results do.

- The snapshot shows memory as it was at the start of each turn. So the writes of a turn show up in the snapshot of the next turn.
- If you open the panel after a turn, it replays the latest memory state. The tab has data even when you open devtools in the middle of a conversation.
