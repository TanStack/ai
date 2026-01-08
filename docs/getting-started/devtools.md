---
title: Devtools
id: devtools
order: 3
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

Import and include the Devtools component in your application:

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