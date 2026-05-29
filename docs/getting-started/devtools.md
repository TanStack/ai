---
title: Devtools
id: devtools
order: 3
description: "Inspect and debug TanStack AI apps with the TanStack Devtools panel — live chat messages, tool call inputs and outputs, state, and errors."
keywords:
  - tanstack ai
  - devtools
  - debugging
  - tool inspection
  - chat inspector
  - react devtools
  - observability
---

TanStack Devtools is a unified devtools panel for inspecting and debugging TanStack libraries, including TanStack AI. It provides real-time insights into AI interactions, tool calls, and state changes, making it easier to develop and troubleshoot AI-powered applications.

## Features
- **Hook dashboard** - Discover every active TanStack AI hook on the page, including chat, structured output, image, video, audio, speech, transcription, and summarize hooks.
- **Run timeline** - Inspect user turns, linked runs, stream events, client snapshots, and server-only events by `threadId` and `runId`.
- **Real-time Monitoring** - View live chat messages, tool invocations, and AI responses.
- **Tool Call Inspection** - Inspect input and output of tool calls.
- **Tool Fixture Replay** - Build tool payloads from a tool's standard-schema input, append the result into chat messages, and save fixtures in localStorage for repeated UI iteration.
- **State Visualization** - Visualize chat state and message history.
- **Error Tracking** - Monitor errors and exceptions in AI interactions.

## Hook Dashboard

The AI devtools panel listens for active TanStack AI clients and shows them in the left sidebar. Hooks register when they are created, emit a snapshot immediately, and respond again whenever the devtools panel opens or requests state. This keeps hooks discoverable even when the panel is opened after the app has already rendered.

Each hook entry includes its type, lifecycle, message count, run count, and the latest linked `threadId`. Selecting a hook opens the full timeline for that hook. Chat hooks keep the current turn-based view: a user message wraps every run and event that happened while answering that turn. The details view also includes lightweight client/server state snapshots between runs so you can see exactly what changed.

### Naming Hooks

When a page has more than one AI hook, pass `devtools.name` to give each hook a user-facing label in the dashboard. The configured name is display-only; hook type, framework, thread id, and run correlation still come from the TanStack AI client.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function SupportChat() {
  const chat = useChat({
    id: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    devtools: {
      name: 'Support Chat',
    },
  })

  // render your chat UI with `chat.messages`, `chat.sendMessage`, etc.
}
```

The same display option works for specialized generation hooks:

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

## Tool Fixtures

When a `useChat` hook receives tools, the devtools panel lists those tools and their schemas. For standard-schema-compatible inputs, the panel renders a small form from the input schema so you can create a tool call payload without hand-writing JSON.

Applying a tool fixture appends the tool call and result into the real chat messages for that hook. Saved fixtures are stored in browser localStorage under the AI devtools namespace so they are available the next time you open the panel.

## Event Sources

Client-visible state is emitted by the headless client. Server-only details, such as middleware and provider stream events that never exist on the client, are emitted from the server counterpart. Events include a source descriptor and stable envelope id so the panel can link related events and avoid displaying duplicates.

## Installation
To use TanStack Devtools with TanStack AI, install the `@tanstack/react-ai-devtools` package:

```bash
npm install -D @tanstack/react-ai-devtools @tanstack/react-devtools
```

Or the `@tanstack/solid-ai-devtools` package for SolidJS:
```bash
npm install -D @tanstack/solid-ai-devtools @tanstack/solid-devtools
```

Or the `@tanstack/preact-ai-devtools` package for Preact:
```bash
npm install -D @tanstack/preact-ai-devtools @tanstack/preact-devtools
```

## Usage

Import and include the TanStackDevtools component in your application:

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

## Using with Next.js (or without a Vite plugin)

`connectToServerBus: true` relies on a WebSocket/SSE server on port 4206 that is normally started by `@tanstack/devtools-vite`. If you're using Next.js (or any non-Vite bundler), you need to start `ServerEventBus` manually at server boot.

In Next.js, do this in `instrumentation.ts`:

```ts
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

This sets globalThis.__TANSTACK_EVENT_TARGET__ so the server-side devtoolsMiddleware (which runs automatically inside every chat() call) can emit tool call events to the bus, which then forwards them to the devtools panel.
