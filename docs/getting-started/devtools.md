---
title: Devtools
id: devtools
---

TanStack Devtools is a unified devtools panel for inspecting and debugging TanStack libraries, including TanStack AI. It provides real-time insights into AI interactions, tool calls, and state changes, making it easier to develop and troubleshoot AI-powered applications.

## Features
- **Real-time Monitoring** - View live chat messages, tool invocations, and AI responses.
- **Tool Call Inspection** - Inspect input and output of tool calls.
- **State Visualization** - Visualize chat state and message history.
- **Error Tracking** - Monitor errors and exceptions in AI interactions.

## Installation
To use TanStack Devtools with TanStack AI, install the `@tanstack/ai-react-devtools` package:

```bash
npm install @tanstack/ai-react-devtools
```

Or the `@tanstack/ai-solid-devtools` package for SolidJS:
```bash
npm install @tanstack/ai-solid-devtools
```

## Usage

Import and include the Devtools component in your application:

```tsx
import { aiDevtoolsPlugin } from '@tanstack/ai-react-devtools'

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