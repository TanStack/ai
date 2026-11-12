---
title: Solid 2
id: solid2
order: 3
description: "Use TanStack AI with Solid 2. Configure the runtime and JSX compiler, keep accessor-based hooks, and migrate from the Solid 1 package."
keywords:
  - tanstack ai
  - solid 2
  - ai-solid2
  - useChat
  - migration
---

Import `useChat` from `@tanstack/ai-solid2` in a Solid 2 app. The hook returns accessors for chat state.

For Solid 1, keep [`@tanstack/ai-solid`](../ui/solid). The packages target different Solid runtimes.

## Configure a Solid 2 app

1. Install the runtime and adapter:

<!-- ::start:tabs variant="package-manager" mode="install" -->

solid: @tanstack/ai @tanstack/ai-solid2 @tanstack/ai-openai solid-js@^2.0.0-rc.21 @solidjs/web@^2.0.0-rc.21

<!-- ::end:tabs -->

2. Install the Solid 2 Vite plugin:

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

solid: @solidjs/vite-plugin@3.0.0-next.57 vite typescript

<!-- ::end:tabs -->

3. Configure `vite.config.ts`:

```ts
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solid()],
})
```

4. Set the JSX source in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "@solidjs/web",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

## Connect a chat

1. Put `OPENAI_API_KEY` in your server environment. Add a `POST` handler at `/api/chat`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const response = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(response)
}
```

The Vite client needs a server that serves this route, or a development proxy to that server. Keep provider keys on the server.

2. Create `src/main.tsx`:

```tsx
import { For, createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid2'

export function Chat() {
  const [input, setInput] = createSignal('')
  const chat = useChat({
    threadId: 'support-42',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <section>
      <For each={chat.messages()}>
        {(message) => (
          <p>
            <For each={message.parts}>
              {(part) => (part.type === 'text' ? part.content : null)}
            </For>
          </p>
        )}
      </For>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const text = input().trim()
          if (!text || chat.isLoading()) return
          void chat.sendMessage(text)
          setInput('')
        }}
      >
        <input
          aria-label="Message"
          value={input()}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        <button type="submit" disabled={chat.isLoading()}>Send</button>
      </form>
      <p role="alert">{chat.error()?.message}</p>
    </section>
  )
}

const root = document.getElementById('app')
if (!root) throw new Error('Missing app root')
render(() => <Chat />, root)
```

3. Load `src/main.tsx` from an HTML entry that contains `<div id="app"></div>`.

Send a message and the reply appears in the page.

## Migrate from Solid 1

1. Replace the three package paths:

| Solid 1 | Solid 2 |
| --- | --- |
| `@tanstack/ai-solid` | `@tanstack/ai-solid2` |
| `@tanstack/ai-solid/ui` | `@tanstack/ai-solid2/ui` |
| `@tanstack/ai-solid/byok` | `@tanstack/ai-solid2/byok` |

2. Replace `vite-plugin-solid` with the Vite plugin shown above. Set `jsxImportSource` to `@solidjs/web`.
3. Import DOM rendering and web JSX types from `@solidjs/web`. Keep reactive primitives in `solid-js`.
4. Keep calls such as `messages()`, `isLoading()`, and `error()`. Generation hooks also keep accessors such as `result()` and `isLoading()`.

The root entry retains chat, generation, recorder, BYOK, and WebMCP hooks. It also re-exports the client helpers.

The `/ui` entry provides `createChatHook` and the chat components. The `/byok` entry provides the framework-independent keyring helpers.

Solid 2 batches signal writes. In tests, wait for the update or call `flush()` before an assertion that needs the committed value.

## Read reactive options

Pass changing values through getters. A `forwardedProps` change keeps the transcript. A `threadId` change selects a new chat client.

```tsx
import { createSignal } from 'solid-js'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid2'

export function ThreadChat() {
  const [threadId, setThreadId] = createSignal('thread-a')
  const [locale, setLocale] = createSignal('en')
  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    get threadId() {
      return threadId()
    },
    get forwardedProps() {
      return { locale: locale() }
    },
  })

  return (
    <section>
      <button onClick={() => setThreadId('thread-b')}>Open thread B</button>
      <button onClick={() => setLocale('fr')}>Use French locale</button>
      <button onClick={() => void chat.sendMessage('Hello')}>Send</button>
      <output>{chat.messages().length} messages</output>
    </section>
  )
}
```

The next request carries the selected locale in `forwardedProps`. Your server decides how to use it.

Create hooks inside a component or an owned root. Disposal releases subscriptions and aborts the local stream connection.
