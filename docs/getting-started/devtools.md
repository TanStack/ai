---
title: Devtools
id: devtools
order: 3
description: "Inspect TanStack AI hooks, runs, tools, memory, and stream events in the Devtools panel."
keywords:
  - tanstack ai
  - devtools
  - debugging
  - tool inspection
  - chat inspector
  - react devtools
  - observability
---

If you need to debug chat/tools → install the AI Devtools plugin, mount `TanStackDevtools`, set `connectToServerBus: true`.

## What you get

**Do now**

- Hook dashboard — every active TanStack AI hook (chat, image, video, speech, …)
- Run timeline — turns, stream events, client/server snapshots by `threadId` / `runId`
- Tool call I/O inspection
- Error tracking on AI interactions

**Later / when relevant**

- Tool fixture replay (schema form → append tool result; fixtures in localStorage)
- Memory tab when using [`memoryMiddleware`](../memory/overview.md)

Hooks register on create, emit a snapshot, and answer when the panel opens — discoverable even if you open Devtools after render. Multiple hooks → set `devtools.name` for labels.

## 1. Install

React:

```bash
npm install -D @tanstack/react-ai-devtools @tanstack/react-devtools
```

Solid:

```bash
npm install -D @tanstack/solid-ai-devtools @tanstack/solid-devtools
```

Preact:

```bash
npm install -D @tanstack/preact-ai-devtools @tanstack/preact-devtools
```

## 2. Mount the panel

```tsx
import { TanStackDevtools } from '@tanstack/react-devtools'
import { aiDevtoolsPlugin } from '@tanstack/react-ai-devtools'

const App = () => {
  return (
    <>
       <TanStackDevtools 
          plugins={[
            // ... other plugins
            aiDevtoolsPlugin(),
          ]}
          // this config is important to connect to the server event bus
          eventBusConfig={{
            connectToServerBus: true,
          }}
        />
    </>
  )
}
```

## 3. Name hooks (multi-hook pages)

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

Same option on generation hooks:

```tsx
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function ImageStudio() {
  const image = useGenerateImage({
    id: 'generation-hooks:useGenerateImage',
    connection: fetchServerSentEvents('/api/image'),
    devtools: {
      name: 'Image Studio',
    },
  })

  // render your image generation UI with `image.generate` and `image.result`
}
```

## Tool fixtures

When `useChat` has tools, the panel lists them and builds a form from standard-schema inputs. Applying a fixture appends tool call + result into real messages; saved fixtures live under the AI Devtools localStorage namespace.

## Memory inspector

With [`memoryMiddleware`](../memory/overview.md), the **Memory** tab shows:

- **Operations** — per-turn recall query, fragment count, chars injected, tools exposed, duration
- **Stored records & facts** — when the adapter implements `inspect` / `listFacts` (`inMemory()`, `redis()` do)

State rides the chat stream (`CUSTOM` event). Snapshot is as of turn start; a turn’s writes show on the next turn. Opening the panel mid-conversation replays the latest memory state.

## Event sources

Client state comes from the headless client. Server-only middleware/provider events come from the server side. Events carry a source descriptor and stable envelope id so the panel can link and dedupe.

## Next.js (no Vite plugin)

`connectToServerBus: true` needs the event bus on port 4206 (normally from `@tanstack/devtools-vite`). On Next.js, start `ServerEventBus` in `instrumentation.ts`:

```ts ignore
export async function register() {
     if (
         process.env["NEXT_RUNTIME"] === "nodejs" &&
         process.env.NODE_ENV === "development"
     ) {
         const { ServerEventBus } = await import(
             "@tanstack/devtools-event-bus/server"
         );
         const bus = new ServerEventBus();
         await bus.start();
     }
}
```

Sets `globalThis.__TANSTACK_EVENT_TARGET__` so server-side `devtoolsMiddleware` (auto inside `chat()`) can emit tool events to the panel.
