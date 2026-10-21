---
title: Quick Start
id: quick-start
order: 2
description: "Add a streaming TanStack AI chat to your app. Pick a framework, install, stream from a server route, and render with the matching hook."
keywords:
  - tanstack ai
  - quick start
  - useChat
  - injectChat
  - createChat
  - streaming chat
  - openai
  - react
  - vue
  - solid
  - svelte
  - preact
  - angular
  - octane
  - remix
redirect_from:
  - /getting-started/quick-start-vue
  - /getting-started/quick-start-svelte
  - /getting-started/quick-start-angular
  - /getting-started/quick-start-octane
---

You want a chat in your app that shows the answer while the model writes it. You need three things: a server route that talks to the model, an API key, and a UI that renders the stream.

TanStack AI gives you each piece. `chat()` streams from your server route. A hook for your framework renders the tokens. This takes about 5 minutes.

Not on the web?

- **React Native or Expo:** go to [Quick Start: React Native](./quick-start-react-native).
- **No UI, only a backend:** go to [Quick Start: Server Only](./quick-start-server).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane
remix: @tanstack/ai @tanstack/ai-remix @tanstack/ai-openai remix

<!-- ::end:tabs -->

Pick your framework at the top of the page. The install command and the UI code follow your pick.

> [!TIP]
> If you do not want a key for each provider, use [OpenRouter](../adapters/openrouter). It gives you 300+ models with one API key.

## 2. Stream from the server

Put your API key in the server environment, for example in `.env`:

```bash
OPENAI_API_KEY=your-openai-api-key
```

Create a route at `/api/chat`. In Next.js, that is `app/api/chat/route.ts`. Call `chat()`, then return the stream with `toServerSentEventsResponse`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

The adapter reads `OPENAI_API_KEY` at runtime. Do not send this key to the browser.

## 3. Render the chat

<!-- ::start:framework -->

# React

Call `useChat` from `@tanstack/ai-react`. Hold the composer text in `useState`. Pass it to `sendMessage`.

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") {
            return;
          }
          sendMessage(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        {isLoading ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </>
  );
}
```

`messages` updates as chunks arrive. `isLoading` is `true` while the run is in flight.

See the [React API](../api/ai-react).

# Vue

Call `useChat` from `@tanstack/ai-vue`. If you are in `<script setup>`, read refs with `.value`. The template unwraps them.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-vue'

const input = ref('')

const { messages, sendMessage, isLoading, stop } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function handleSubmit() {
  if (input.value.trim() && !isLoading.value) {
    sendMessage(input.value)
    input.value = ''
  }
}
</script>

<template>
  <div>
    <div v-for="message in messages" :key="message.id">
      <template v-for="(part, index) in message.parts" :key="index">
        <p v-if="part.type === 'text'">{{ part.content }}</p>
      </template>
    </div>
    <form @submit.prevent="handleSubmit">
      <input v-model="input" :disabled="isLoading" />
      <button v-if="isLoading" type="button" @click="stop">Stop</button>
      <button v-else type="submit" :disabled="!input.trim()">Send</button>
    </form>
  </div>
</template>
```

The composable stops in-flight requests when the component unmounts.

See the [Vue API](../api/ai-vue).

# Solid

Call `useChat` from `@tanstack/ai-solid`. `messages` and `isLoading` are accessors. Call them as functions.

```tsx ignore
import { For, createSignal } from "solid-js";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

export function Chat() {
  const [input, setInput] = createSignal("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <>
      <For each={messages()}>
        {(message) => (
          <div>
            <For each={message.parts}>
              {(part) =>
                part.type === "text" ? <p>{part.content}</p> : null
              }
            </For>
          </div>
        )}
      </For>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input().trim() === "") {
            return;
          }
          sendMessage(input());
          setInput("");
        }}
      >
        <input
          value={input()}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        {isLoading() ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </>
  );
}
```

See the [Solid API](../api/ai-solid).

# Svelte

Call `createChat` from `@tanstack/ai-svelte`. The return object uses reactive getters. Read `chat.messages` and `chat.isLoading` with no extra wrapper.

```svelte
<script lang="ts">
import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

let input = $state('')

const chat = createChat({
  connection: fetchServerSentEvents('/api/chat'),
})

function handleSubmit() {
  if (input.trim() && !chat.isLoading) {
    chat.sendMessage(input)
    input = ''
  }
}
</script>

<div>
  {#each chat.messages as message (message.id)}
    <div>
      {#each message.parts as part}
        {#if part.type === 'text'}
          <p>{part.content}</p>
        {/if}
      {/each}
    </div>
  {/each}

  <form onsubmit={handleSubmit}>
    <input bind:value={input} disabled={chat.isLoading} />
    {#if chat.isLoading}
      <button type="button" onclick={() => chat.stop()}>Stop</button>
    {:else}
      <button type="submit" disabled={!input.trim()}>Send</button>
    {/if}
  </form>
</div>
```

If the component can unmount while a response streams, call `chat.stop()` in `onDestroy`.

See the [Svelte API](../api/ai-svelte).

# Preact

Call `useChat` from `@tanstack/ai-preact`. Hold the composer text with `useState` from `preact/hooks`.

```tsx ignore
import { useState } from "preact/hooks";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") {
            return;
          }
          sendMessage(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        {isLoading ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </>
  );
}
```

See the [Preact API](../api/ai-preact).

# Angular

Call `injectChat` in a field initializer. State is a `Signal`. Read it by calling the function.

```typescript ignore
import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { injectChat, fetchServerSentEvents } from "@tanstack/ai-angular";

@Component({
  selector: "app-chat",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div>
      @for (message of chat.messages(); track message.id) {
        <div>
          @for (part of message.parts; track $index) {
            @if (part.type === "text") {
              <p>{{ part.content }}</p>
            }
          }
        </div>
      }
      <form (submit)="send($event)">
        <input [(ngModel)]="draft" name="draft" [disabled]="chat.isLoading()" />
        @if (chat.isLoading()) {
          <button type="button" (click)="chat.stop()">Stop</button>
        } @else {
          <button type="submit" [disabled]="!draft.trim()">Send</button>
        }
      </form>
    </div>
  `,
})
export class ChatComponent {
  chat = injectChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  draft = "";

  send(event: Event) {
    event.preventDefault();
    const text = this.draft.trim();
    if (text && !this.chat.isLoading()) {
      void this.chat.sendMessage(text);
      this.draft = "";
    }
  }
}
```

Call `injectChat` in a field initializer or the constructor. A call in `ngOnInit` throws.

`injectChat` subscribes to `DestroyRef`. In-flight requests stop when the component is destroyed.

See the [Angular API](../api/ai-angular).

# Octane

Call `useChat` from `@tanstack/ai-octane`. Hold the composer text in `useState` from `octane`. Octane text controls fire `onInput`.

`@tanstack/ai-octane` publishes uncompiled `.tsrx` source. Add `octane/compiler/vite` (or the rspack / rspeedy equivalent) to the app build.

```tsx ignore
import { useState } from "octane";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-octane";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <p>
            {message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.content)
              .join("")}
          </p>
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim() === "") {
            return;
          }
          void sendMessage(input);
          setInput("");
        }}
      >
        <input
          value={input}
          disabled={isLoading}
          onInput={(event) => setInput(event.currentTarget.value)}
        />
        {isLoading ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
```

The hook calls `attach()` on mount. It calls `detach()` and `dispose()` on unmount.

See the [Octane API](../api/ai-octane).

# Remix

Call `createChat(handle, options)` from `@tanstack/ai-remix` inside a `clientEntry` island. Put `connection` and `tools` in setup. They are not serializable `clientEntry` props.

`@tanstack/ai-remix` publishes uncompiled source. Remix compiles JSX through `jsxImportSource` `remix/ui`. Bind the form with the Remix `on` mixin.

```tsx ignore
import { createChat, fetchServerSentEvents } from "@tanstack/ai-remix";
import { clientEntry, on, type Handle } from "remix/ui";

export const Chat = clientEntry(
  import.meta.url,
  function Chat(handle: Handle) {
    const chat = createChat(handle, {
      connection: fetchServerSentEvents("/api/chat"),
    });

    return () => (
      <div>
        {chat.messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part, index) =>
              part.type === "text" ? <p key={index}>{part.content}</p> : null,
            )}
          </div>
        ))}
        <form
          mix={on("submit", (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const text = String(
              new FormData(form).get("message") ?? "",
            ).trim();
            if (text === "") {
              return;
            }
            form.reset();
            void chat.sendMessage(text);
          })}
        >
          <input name="message" disabled={chat.isLoading} />
          {chat.isLoading ? (
            <button type="button" mix={on("click", () => chat.stop())}>
              Stop
            </button>
          ) : (
            <button type="submit">Send</button>
          )}
        </form>
      </div>
    );
  },
);
```

Read `chat.messages` and `chat.isLoading` in the render function so each paint sees the latest values.

See the [Remix API](../api/ai-remix). For a typed headless chat UI, see [Remix Chat UI](../ui/remix).

<!-- ::end:framework -->

No framework? Use `ChatClient` from `@tanstack/ai-client`. See the [client API](../api/ai-client).

## 4. Try it

Start your app and send a message. The answer appears word by word while the model writes it. Click **Stop** to cancel a run.

You now have a streaming chat.

## How it works

1. `sendMessage` posts the messages to `/api/chat`.
2. `chatParamsFromRequest` reads the messages and the run ids from the request.
3. `chat()` calls the model through the adapter and returns a stream of events.
4. `toServerSentEventsResponse` sends those events back as Server-Sent Events.
5. `fetchServerSentEvents` reads the events, and the hook adds each chunk to `messages`.

Each message has `parts`. This page renders only the `text` parts. Tool calls and other content arrive as other part types.

## Next

Add one feature at a time:

- [Tools](../tools/tools): let the model call your functions.
- [Streaming](../chat/streaming): cancel, callbacks, and transports.
- [Adapters](../adapters/openai): switch to another provider.

Or build a full app in a tutorial, such as [Basic Chat](../tutorials/basic-chat) or [Generate Image](../tutorials/generate-image).

## Advanced

### Hosts

The server route returns a Web `Response`. It works with any host that can return one:

- TanStack Start
- Next.js
- SvelteKit
- Hono
- A Remix controller action

If your server uses Node streams (Express), see [Quick Start: Server Only](./quick-start-server).

### Bad request bodies

If the request body is not valid, `chatParamsFromRequest` throws a `Response` with status 400.

- TanStack Start, SolidStart, Remix, and React Router 7 return a thrown `Response` to the client for you.
- Next.js Route Handlers, SvelteKit, Hono, and raw Node do not. Wrap the call in `try`/`catch` and return the caught `Response`.

### Keys in the browser

If you do not want a key on the server, users can paste their own provider key. See [Bring Your Own Key](../advanced/byok).
