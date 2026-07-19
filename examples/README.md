# TanStack AI Examples

This directory contains comprehensive examples demonstrating TanStack AI across multiple TypeScript frameworks.

## Quick Start

Choose an example based on your use case:

- **Want a full-stack TypeScript app?** → [TanStack Chat (ts-react-chat)](#tanstack-chat-ts-react-chat)
- **Need a vanilla JS frontend?** → [Vanilla Chat](#vanilla-chat)
- **Multi-User TypeScript chat app?** → [Group Chat (ts-group-chat)](#group-chat-ts-group-chat)
- **Polyglot AG-UI backends (Go/Rust)?** → [AG-UI Polyglot Echo (ag-ui)](#ag-ui-polyglot-echo-ag-ui)

## TypeScript Examples

### TanStack Chat (ts-react-chat)

A full-featured chat application built with the TanStack ecosystem.

**Tech Stack:**

- TanStack Start (full-stack React framework)
- TanStack Router (type-safe routing)
- TanStack Store (state management)
- `@tanstack/ai` (AI backend)
- `@tanstack/ai-react` (React hooks)
- `@tanstack/ai-client` (headless client)

**Features:**

- ✅ Real-time streaming with OpenAI GPT-4o
- ✅ Automatic tool execution loop
- ✅ Rich markdown rendering
- ✅ Conversation management
- ✅ Modern UI with Tailwind CSS

**Getting Started:**

```bash
cd examples/ts-react-chat
pnpm install
cp env.example .env
# Edit .env and add your OPENAI_API_KEY
pnpm start
```

📖 [Full Documentation](ts-react-chat/README.md)

---

### Group Chat (ts-group-chat)

A real-time multi-user chat application with AI integration, demonstrating WebSocket-based communication and TanStack AI.

**Tech Stack:**

- TanStack Start (full-stack React framework)
- TanStack Router (type-safe routing)
- Cap'n Web RPC (bidirectional WebSocket RPC)
- `@tanstack/ai` (AI backend)
- `@tanstack/ai-anthropic` (Claude adapter)
- `@tanstack/ai-client` (headless client)
- `@tanstack/ai-react` (React hooks)

**Features:**

- ✅ Real-time multi-user chat with WebSocket
- ✅ Online presence tracking
- ✅ AI assistant (Claude) integration with queuing
- ✅ Message broadcasting to all users
- ✅ Modern chat UI (iMessage-style)
- ✅ Username-based authentication (no registration)

**Getting Started:**

```bash
cd examples/ts-group-chat
pnpm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
pnpm dev
```

Open `http://localhost:4000` in multiple browser tabs to test multi-user functionality.

**Key Concepts:**

- **WebSocket RPC**: Uses Cap'n Web RPC for type-safe bidirectional communication
- **AI Queuing**: Claude requests are queued and processed sequentially
- **Real-time Updates**: Messages and online users update in real-time
- **Message Broadcasting**: Server broadcasts messages to all connected clients

📖 [Full Documentation](ts-group-chat/README.md)

---

### Vanilla Chat

A framework-free chat application using pure JavaScript and `@tanstack/ai-client`.

**Tech Stack:**

- Vanilla JavaScript (no frameworks!)
- `@tanstack/ai-client` (headless client)
- Vite (dev server)

**Features:**

- ✅ Pure vanilla JavaScript
- ✅ Real-time streaming messages
- ✅ Beautiful, responsive UI
- ✅ No framework dependencies

**Getting Started:**

```bash
cd examples/vanilla-chat
pnpm install
pnpm start
```

📖 [Full Documentation](vanilla-chat/README.md)

---

### AG-UI Polyglot Echo (ag-ui)

A React SPA that connects to **Go and Rust chat servers** over the AG-UI SSE protocol, with each backend streaming OpenAI or Anthropic completions.

**Tech Stack:**

- React + Vite (SPA)
- `@tanstack/ai-react` + `@tanstack/ai-react-ui`
- Go chat server (`net/http`, `:8001`)
- Rust chat server (Axum, `:8002`)

**Features:**

- ✅ Backend picker (Go | Rust)
- ✅ Provider picker (OpenAI | Anthropic)
- ✅ Hand-rolled AG-UI SSE in two languages
- ✅ Streaming LLM responses via env API keys

**Getting Started:**

```bash
cd examples/ag-ui
pnpm install
cp .env.example .env
pnpm dev:all
```

Requires Go 1.22+, Rust stable, and provider API keys.

📖 [Full Documentation](ag-ui/README.md)

---

## Architecture Patterns

### Full-Stack TypeScript

Use TanStack AI end-to-end in TypeScript:

```
Frontend (React)
  ↓ (useChat hook)
@tanstack/ai-react
  ↓ (ChatClient)
@tanstack/ai-client
  ↓ (SSE/HTTP)
Backend (TanStack Start API Route)
  ↓ (chat() function)
@tanstack/ai
  ↓ (adapter)
AI Provider (OpenAI/Anthropic/etc.)
```

**Example:** [TanStack Chat (ts-react-chat)](ts-react-chat/README.md)

## Common Patterns

### Server-Sent Events (SSE) Streaming

All examples use SSE for real-time streaming:

**Backend:**

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages,
})

return toServerSentEventsResponse(stream)
```

**Frontend:**

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
})
```

### Automatic Tool Execution

The TypeScript backend (`@tanstack/ai`) automatically handles tool execution:

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Step 1: Define the tool schema
const weatherToolDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a location',
  inputSchema: z.object({
    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
  }),
  outputSchema: z.object({
    temp: z.number(),
    condition: z.string(),
  }),
})

// Step 2: Create server implementation
const weatherTool = weatherToolDef.server(async ({ location }) => {
  // This is called automatically by the SDK
  return { temp: 72, condition: 'sunny' }
})

const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages,
  tools: [weatherTool], // SDK executes these automatically
})
```

Clients receive:

- `content` chunks - text from the model
- `tool_call` chunks - when the model calls a tool
- `tool_result` chunks - results from tool execution
- `done` chunk - conversation complete

---

## Development Tips

### Environment Variables

Each example has an `env.example` file. Copy it to `.env` and add your API keys:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Building for Production

```bash
pnpm build
```

---

## Contributing

When adding new examples:

1. **Create a README.md** with setup instructions
2. **Add an env.example** file with required environment variables
3. **Document the tech stack** and key features
4. **Include usage examples** with code snippets
5. **Update this README** to list your example

---

## Learn More

- 📖 [Main README](../README.md) - Project overview
- 📖 [Documentation](../docs/) - Comprehensive guides
- 📖 [TypeScript Packages](../packages/) - Core libraries

---

Built with ❤️ by the TanStack community
