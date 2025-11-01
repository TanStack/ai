# TanStack AI PHP Slim Framework Example

This is a PHP Slim Framework server example that demonstrates how to stream Anthropic and OpenAI API events in Server-Sent Events (SSE) format compatible with the TanStack AI client.

## Features

- PHP Slim Framework server with SSE streaming support
- Converts Anthropic and OpenAI API events to TanStack AI `StreamChunk` format
- Compatible with `@tanstack/ai-client`'s `fetchServerSentEvents` adapter
- Supports tool calls and function calling
- Type-safe request/response handling

## Setup

### Prerequisites

- PHP 8.1 or higher
- Composer (PHP dependency manager)

### Step-by-Step Setup

1. **Navigate to the project directory:**

```bash
cd examples/php-slim
```

2. **Install dependencies:**

```bash
composer install
```

This will install all required packages (Slim Framework, Anthropic SDK, OpenAI SDK, etc.).

3. **Set up environment variables:**

Copy `env.example` to `.env` and add your API keys:

```bash
cp env.example .env
# Edit .env and add your ANTHROPIC_API_KEY and/or OPENAI_API_KEY
```

4. **Run the server:**

**For Anthropic:**
```bash
php -S 0.0.0.0:8000 -t public public/anthropic-server.php
```

Or using Composer:
```bash
composer start-anthropic
```

**For OpenAI:**
```bash
php -S 0.0.0.0:8001 -t public public/openai-server.php
```

Or using Composer:
```bash
composer start-openai
```

The servers will start on:
- Anthropic: `http://localhost:8000`
- OpenAI: `http://localhost:8001`

## API Endpoints

### POST `/chat`

Streams chat responses in SSE format.

**Request Body:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

**Response:** Server-Sent Events stream with `StreamChunk` format:

```
data: {"type":"content","id":"...","model":"claude-3-haiku-20240307","timestamp":1234567890,"delta":"Hello","content":"Hello","role":"assistant"}

data: {"type":"content","id":"...","model":"claude-3-haiku-20240307","timestamp":1234567890,"delta":" world","content":"Hello world","role":"assistant"}

data: {"type":"done","id":"...","model":"claude-3-haiku-20240307","timestamp":1234567890,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":2,"totalTokens":12}}

data: [DONE]
```

### GET `/health`

Health check endpoint.

## Usage with TanStack AI Client

This server is compatible with the TypeScript TanStack AI client:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("http://localhost:8000/chat"),
});

await client.sendMessage("Hello!");
```

## StreamChunk Format

The `tanstack/ai` package converts provider events to the following `StreamChunk` types:

- **`content`**: Text content updates with delta and accumulated content
- **`tool_call`**: Tool/function call events with incremental arguments
- **`done`**: Stream completion with finish reason and usage stats
- **`error`**: Error events

See `packages/typescript/ai/src/types.ts` for the full TypeScript type definitions.

## Supported Providers

The converter currently supports:
- ✅ **Anthropic** (Claude models) - fully implemented
- ✅ **OpenAI** (GPT models) - fully implemented

## Project Structure

```
php-slim/
├── public/
│   ├── anthropic-server.php  # Anthropic server
│   └── openai-server.php     # OpenAI server
├── composer.json              # PHP dependencies
├── env.example                # Environment variables template
└── README.md                  # This file
```

## Architecture

The server uses the `tanstack/ai` package located at `packages/php/tanstack-ai/`:

- **`anthropic-server.php`** / **`openai-server.php`**: Handles Slim setup, provider client initialization, and HTTP endpoints
- **`tanstack/ai` package**: Provides `StreamChunkConverter`, message formatters, and SSE utilities for converting provider events to TanStack AI format

The converter package is installed as a local dependency, making it easy to develop and test changes.

## Notes

- The server uses CORS middleware allowing all origins (configure for production)
- Default Anthropic model is `claude-3-haiku-20240307` (can be made configurable)
- Default OpenAI model is `gpt-4o` (can be made configurable)
- Supports system messages, tool calls, and tool results
- Error handling converts exceptions to error StreamChunks
- Uses PHP 8.1+ features including named arguments and match expressions

## Development

To use the local `tanstack/ai` package during development:

1. Add to `composer.json`:
```json
{
  "repositories": [
    {
      "type": "path",
      "url": "../../packages/php/tanstack-ai"
    }
  ],
  "require": {
    "tanstack/ai": "@dev"
  }
}
```

2. Run:
```bash
composer update tanstack/ai
```

