# TanStack AI Python FastAPI Example

This is a Python FastAPI server example that demonstrates how to stream Anthropic API events in Server-Sent Events (SSE) format compatible with the TanStack AI client.

## Features

- FastAPI server with SSE streaming support
- Converts Anthropic API events to TanStack AI `StreamChunk` format
- Compatible with `@tanstack/ai-client`'s `fetchServerSentEvents` adapter
- Supports tool calls and function calling
- Type-safe request/response models using Pydantic

## Setup

### Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

### Step-by-Step Setup

1. **Navigate to the project directory:**

```bash
cd examples/python-fastapi
```

2. **Create a virtual environment (recommended):**

A virtual environment keeps dependencies isolated from your system Python installation.

```bash
python3 -m venv venv
```

3. **Activate the virtual environment:**

   - **On macOS/Linux:**

     ```bash
     source venv/bin/activate
     ```

   - **On Windows:**
     ```bash
     venv\Scripts\activate
     ```

   You should see `(venv)` in your terminal prompt when activated.

4. **Install dependencies:**

```bash
pip install -r requirements.txt
```

This will install all required packages (FastAPI, Anthropic SDK, Pydantic, etc.).

5. **Set up environment variables:**

Copy `env.example` to `.env` and add your Anthropic API key:

```bash
cp env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

6. **Run the server:**

```bash
python anthropic-server.py
```

Or using uvicorn directly:

```bash
uvicorn anthropic-server:app --reload --port 8000
```

The server will start on `http://localhost:8000`

### Deactivating the Virtual Environment

When you're done, you can deactivate the virtual environment:

```bash
deactivate
```

**Note:** The `venv/` directory is already included in `.gitignore`, so it won't be committed to version control.

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
data: {"type":"content","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567890,"delta":"Hello","content":"Hello","role":"assistant"}

data: {"type":"content","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567890,"delta":" world","content":"Hello world","role":"assistant"}

data: {"type":"done","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567890,"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":2,"totalTokens":12}}

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

The `tanstack-ai` package converts provider events to the following `StreamChunk` types:

- **`content`**: Text content updates with delta and accumulated content
- **`tool_call`**: Tool/function call events with incremental arguments
- **`done`**: Stream completion with finish reason and usage stats
- **`error`**: Error events

See `packages/typescript/ai/src/types.ts` for the full TypeScript type definitions.

## Supported Providers

The converter currently supports:
- ✅ **Anthropic** (Claude models) - fully implemented
- ✅ **OpenAI** (GPT models) - converter implemented, ready to use

To add OpenAI support, import `StreamChunkConverter` with `provider="openai"` and use OpenAI's streaming API.

## Project Structure

```
python-fastapi/
├── anthropic-server.py  # FastAPI server example
├── requirements.txt      # Python dependencies (includes tanstack-ai package)
├── env.example       # Environment variables template
└── README.md         # This file
```

## Architecture

The server uses the `tanstack-ai` package located at `packages/python/tanstack-ai/`:

- **`anthropic-server.py`**: Handles FastAPI setup, Anthropic client initialization, and HTTP endpoints
- **`tanstack-ai` package**: Provides `StreamChunkConverter`, message formatters, and SSE utilities for converting provider events to TanStack AI format

The converter package is installed as an editable dependency, making it easy to develop and test changes.

## Notes

- The server uses CORS middleware allowing all origins (configure for production)
- Default model is `claude-3-5-sonnet-20241022` (can be made configurable)
- Supports system messages, tool calls, and tool results
- Error handling converts exceptions to error StreamChunks
