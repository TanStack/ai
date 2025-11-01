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
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --port 8080
```

The server will start on `http://localhost:8080`

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
  connection: fetchServerSentEvents("http://localhost:8080/chat"),
});

await client.sendMessage("Hello!");
```

## StreamChunk Format

The `tanstack_ai_converter.py` module converts provider events to the following `StreamChunk` types:

- **`content`**: Text content updates with delta and accumulated content
- **`tool_call`**: Tool/function call events with incremental arguments
- **`done`**: Stream completion with finish reason and usage stats
- **`error`**: Error events

See `packages/ai/src/types.ts` for the full TypeScript type definitions.

## Supported Providers

The converter currently supports:
- ✅ **Anthropic** (Claude models) - fully implemented
- ✅ **OpenAI** (GPT models) - converter implemented, ready to use

To add OpenAI support, import `StreamChunkConverter` with `provider="openai"` and use OpenAI's streaming API.

## Project Structure

```
python-fastapi/
├── main.py                    # FastAPI server (concise example)
├── tanstack_ai_converter.py  # Converts provider events to TanStack AI format
├── message_formatters.py      # Message format conversion utilities
├── requirements.txt           # Python dependencies
├── env.example                # Environment variables template
└── README.md                  # This file
```

## Architecture

The server is split into focused modules:

- **`main.py`**: Handles FastAPI setup, Anthropic client initialization, and HTTP endpoints
- **`tanstack_ai_converter.py`**: Converts streaming events from providers (Anthropic, OpenAI) to TanStack AI `StreamChunk` format
- **`message_formatters.py`**: Utilities for converting between TanStack AI and provider message formats

This separation makes it easy to:
- Add support for new providers (just implement a converter method)
- Reuse the converter in other projects
- Keep the main server file clean and focused

## Notes

- The server uses CORS middleware allowing all origins (configure for production)
- Default model is `claude-3-5-sonnet-20241022` (can be made configurable)
- Supports system messages, tool calls, and tool results
- Error handling converts exceptions to error StreamChunks
