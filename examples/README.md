# TanStack AI Examples

This directory contains comprehensive examples demonstrating TanStack AI across multiple languages and frameworks.

## Quick Start

Choose an example based on your use case:

- **Want a full-stack TypeScript app?** → [TanStack Chat (ts-chat)](#tanstack-chat-ts-chat)
- **Want a simple CLI tool?** → [CLI Example](#cli-example)
- **Need a vanilla JS frontend?** → [Vanilla Chat](#vanilla-chat)
- **Building a Python backend?** → [Python FastAPI Server](#python-fastapi-server)
- **Building a PHP backend?** → [PHP Slim Framework Server](#php-slim-framework-server)

## TypeScript Examples

### TanStack Chat (ts-chat)

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
cd examples/ts-chat
pnpm install
cp env.example .env
# Edit .env and add your OPENAI_API_KEY
pnpm start
```

📖 [Full Documentation](ts-chat/README.md)

---

### CLI Example

An interactive command-line interface for AI interactions.

**Features:**
- ✅ Multi-provider support (OpenAI, Anthropic, Ollama, Gemini)
- ✅ Interactive chat with streaming
- ✅ Automatic tool/function calling
- ✅ Smart API key management
- ✅ Debug mode for development

**Getting Started:**
```bash
cd examples/cli
pnpm install
pnpm dev chat --provider openai
```

**Available Commands:**
- `chat` - Interactive chat with streaming
- `generate` - One-shot text generation
- `summarize` - Text summarization
- `embed` - Generate embeddings

📖 [Full Documentation](cli/README.md)

---

### Vanilla Chat

A framework-free chat application using pure JavaScript and `@tanstack/ai-client`.

**Tech Stack:**
- Vanilla JavaScript (no frameworks!)
- `@tanstack/ai-client` (headless client)
- Vite (dev server)
- Connects to Python FastAPI backend

**Features:**
- ✅ Pure vanilla JavaScript
- ✅ Real-time streaming messages
- ✅ Beautiful, responsive UI
- ✅ No framework dependencies

**Getting Started:**
```bash
# Start the Python backend first
cd examples/python-fastapi
python anthropic-server.py

# Then start the frontend
cd examples/vanilla-chat
pnpm install
pnpm dev
```

Open `http://localhost:3000`

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
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("http://localhost:8000/chat"),
});

await client.sendMessage("Hello!");
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
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("http://localhost:8000/chat"),
});

await client.sendMessage("Hello!");
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

**Example:** [TanStack Chat (ts-chat)](ts-chat/README.md)

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
- [PHP Slim](php-slim/README.md) + any frontend with `@tanstack/ai-client`

### CLI Tool

Use TanStack AI in command-line applications:

```
CLI
  ↓ (chat() function)
@tanstack/ai
  ↓ (adapter)
AI Provider (OpenAI/Anthropic/Ollama/Gemini)
```

**Example:** [CLI Example](cli/README.md)

---

## Common Patterns

### Server-Sent Events (SSE) Streaming

All examples use SSE for real-time streaming:

**Backend (TypeScript):**
```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages,
});

return toStreamResponse(stream);
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
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
});
```

### Automatic Tool Execution

The TypeScript backend (`@tanstack/ai`) automatically handles tool execution:

```typescript
import { chat, tool } from "@tanstack/ai";

const weatherTool = tool({
  function: {
    name: "getWeather",
    description: "Get weather for a location",
    parameters: { /* ... */ },
  },
  execute: async (args) => {
    // This is called automatically by the SDK
    return JSON.stringify({ temp: 72, condition: "sunny" });
  },
});

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages,
  tools: [weatherTool],  // SDK executes these automatically
});
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
# Terminal 1: Start Python backend
cd examples/python-fastapi
python anthropic-server.py

# Terminal 2: Start vanilla frontend
cd examples/vanilla-chat
pnpm dev

# Terminal 3: Start ts-chat (full-stack)
cd examples/ts-chat
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
