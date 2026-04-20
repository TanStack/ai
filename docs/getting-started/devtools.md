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
- **Real-time Monitoring** - View live chat messages, tool invocations, and AI responses.
- **Tool Call Inspection** - Inspect input and output of tool calls.
- **State Visualization** - Visualize chat state and message history.
- **Error Tracking** - Monitor errors and exceptions in AI interactions.

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
