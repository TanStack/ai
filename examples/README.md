# TanStack AI Examples

This directory contains comprehensive examples demonstrating TanStack AI across multiple languages and frameworks.

## Quick Start

Choose an example based on your use case:

- **Want a full-stack TypeScript app?** → [TanStack Chat (ts-react-chat)](#tanstack-chat-ts-react-chat)
- **Need a vanilla JS frontend?** → [Vanilla Chat](#vanilla-chat)
- **Building a Python backend?** → [Python FastAPI Server](#python-fastapi-server)
- **Building a PHP backend?** → [PHP Slim Framework Server](#php-slim-framework-server)
- **Multi-User TypeScript chat app?** → [Group Chat (ts-group-chat)](#group-chat-ts-group-chat)

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

A framework-free chat application using pure JavaScript and `@tanstack/ai-client`. Works with both PHP and Python backends.

**Tech Stack:**

- Vanilla JavaScript (no frameworks!)
- `@tanstack/ai-client` (headless client)
- Vite (dev server)
- Compatible with PHP Slim or Python FastAPI backends

**Features:**

- ✅ Pure vanilla JavaScript
- ✅ Real-time streaming messages
- ✅ Beautiful, responsive UI
- ✅ No framework dependencies
- ✅ Works with multiple backend languages

**Getting Started:**

**Option 1: With Python Backend**

```bash
# Start the Python backend first
cd examples/python-fastapi
python anthropic-server.py

# Then start the frontend
cd examples/vanilla-chat
pnpm install
pnpm start
```

**Option 2: With PHP Backend**

```bash
# Start the PHP backend and UI together
cd examples/php-slim
pnpm install
composer install
cp env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
pnpm start
```

Open `http://localhost:3001` (UI) - connects to backend on port 8000

📖 [Full Documentation](vanilla-chat/README.md)

---

## Python Examples

### Python FastAPI Server

A FastAPI server that streams AI responses in Server-Sent Events (SSE) format, compatible with TanStack AI clients.

**Features:**

- ✅ FastAPI with SSE streaming
- ✅ Converts Anthropic/OpenAI events to `StreamChunk` format
- ✅ Compatible with `@tanstack/ai-client`
- ✅ Tool call support
- ✅ Type-safe with Pydantic

**Getting Started:**

```bash
cd examples/python-fastapi

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp env.example .env
# Edit .env and add your ANTHROPIC_API_KEY or OPENAI_API_KEY

# Run the server
python anthropic-server.py  # or openai-server.py
```

**API Endpoints:**

- `POST /chat` - Stream chat responses in SSE format
- `GET /health` - Health check

**Usage with TypeScript Client:**

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:8000/chat'),
})

await client.sendMessage('Hello!')
```

📖 [Full Documentation](python-fastapi/README.md)

---

## PHP Examples

### PHP Slim Framework Server

A PHP Slim Framework server that streams AI responses in SSE format, with support for both Anthropic and OpenAI.

**Features:**

- ✅ Slim Framework with SSE streaming
- ✅ Converts Anthropic/OpenAI events to `StreamChunk` format
- ✅ Compatible with `@tanstack/ai-client`
- ✅ Tool call support
- ✅ PHP 8.1+ with type safety

**Getting Started:**

```bash
cd examples/php-slim

# Install dependencies
composer install

# Set up environment
cp env.example .env
# Edit .env and add your ANTHROPIC_API_KEY and/or OPENAI_API_KEY

# Run the server
composer start-anthropic  # Runs on port 8000
# or
composer start-openai     # Runs on port 8001
```

**API Endpoints:**

- `POST /chat` - Stream chat responses in SSE format
- `GET /health` - Health check

**Usage with TypeScript Client:**

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:8000/chat'),
})

await client.sendMessage('Hello!')
```

📖 [Full Documentation](php-slim/README.md)

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

### Multi-Language Backend

Use Python or PHP for the backend, TypeScript for the frontend:

```
Frontend (Vanilla JS/React/Vue/etc.)
  ↓ (ChatClient)
@tanstack/ai-client
  ↓ (SSE/HTTP)
Backend (Python FastAPI or PHP Slim)
  ↓ (tanstack-ai or tanstack/ai)
Stream Conversion & Message Formatting
  ↓ (provider SDK)
AI Provider (OpenAI/Anthropic/etc.)
```

**Examples:**

- [Python FastAPI](python-fastapi/README.md) + [Vanilla Chat](vanilla-chat/README.md)
- [PHP Slim](php-slim/README.md) + [Vanilla Chat](vanilla-chat/README.md)
- [PHP Slim](php-slim/README.md) + any frontend with `@tanstack/ai-client`

## Common Patterns

### Server-Sent Events (SSE) Streaming

All examples use SSE for real-time streaming:

**Backend (TypeScript):**

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

**Backend (Python):**

```python
from tanstack_ai import StreamChunkConverter, format_sse_chunk

async for event in anthropic_stream:
    chunks = await converter.convert_event(event)
    for chunk in chunks:
        yield format_sse_chunk(chunk)
```

**Backend (PHP):**

```php
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\SSEFormatter;

foreach ($anthropicStream as $event) {
    $chunks = $converter->convertEvent($event);
    foreach ($chunks as $chunk) {
        echo SSEFormatter::formatChunk($chunk);
    }
}
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

### Running Multiple Examples

You can run backend and frontend examples together:

```bash
# Option 1: Python backend + Vanilla Chat frontend
# Terminal 1: Start Python backend
cd examples/python-fastapi
python anthropic-server.py

# Terminal 2: Start vanilla frontend
cd examples/vanilla-chat
pnpm start

# Option 2: PHP backend + Vanilla Chat frontend (runs together)
cd examples/php-slim
pnpm start  # Starts both PHP server and vanilla-chat UI

# Option 3: Full-stack TypeScript
cd examples/ts-react-chat
pnpm start
```

### Environment Variables

Each example has an `env.example` file. Copy it to `.env` and add your API keys:

```bash
# TypeScript examples
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Python examples
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# PHP examples
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Building for Production

**TypeScript:**

```bash
pnpm build
```

**Python:**

```bash
# Use a production ASGI server
uvicorn anthropic-server:app --host 0.0.0.0 --port 8000
```

**PHP:**

```bash
# Use a production web server (Apache, Nginx, etc.)
# See php-slim/README.md for deployment details
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
- 📖 [TypeScript Packages](../packages/typescript/) - Core libraries
- 📖 [Python Package](../packages/python/tanstack-ai/) - Python utilities
- 📖 [PHP Package](../packages/php/tanstack-ai/) - PHP utilities

---

Built with ❤️ by the TanStack community
