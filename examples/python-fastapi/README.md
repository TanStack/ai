# TanStack AI Python FastAPI Example

This is a Python FastAPI server example that demonstrates agentic workflows with automatic tool execution using TanStack AI's Python SDK.

## Features

- 🤖 **Agentic workflows** with automatic tool execution
- 🔧 **Built-in tools**: Weather lookup and timezone information
- 📡 **SSE streaming** support for real-time responses
- 🔄 **Agent loop strategies** with configurable iteration limits
- ✅ Compatible with `@tanstack/ai-client`'s `fetchServerSentEvents` adapter
- 📝 Type-safe request/response models using Pydantic

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

Streams chat responses in SSE format with automatic tool execution.

**Request Body:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in San Francisco?"
    }
  ],
  "data": {
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

**Response:** Server-Sent Events stream with `StreamChunk` format:

```
data: {"type":"content","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567890,"delta":"Let","content":"Let","role":"assistant"}

data: {"type":"tool_call","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567890,"toolCall":{"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\"location\":\"San Francisco\"}"}},"index":0}

data: {"type":"tool_result","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567891,"toolCallId":"call_123","content":"{\"temperature\":62,\"conditions\":\"Foggy\",\"location\":\"San Francisco\"}"}

data: {"type":"content","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567892,"delta":"The","content":"The","role":"assistant"}

data: {"type":"done","id":"...","model":"claude-3-5-sonnet-20241022","timestamp":1234567893,"finishReason":"stop","usage":{"promptTokens":150,"completionTokens":75,"totalTokens":225}}

data: [DONE]
```

### GET `/health`

Health check endpoint.

## Available Tools

The server includes two built-in tools that are automatically executed:

### 1. `get_weather`

Get weather information for a city (returns static demo data).

**Parameters:**

- `location` (required): City name (e.g., "San Francisco", "New York", "London")
- `unit` (optional): Temperature unit - "celsius" or "fahrenheit" (default: fahrenheit)

**Supported Cities:**

- San Francisco, New York, London, Tokyo, Paris, Sydney

**Example:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Tokyo in celsius?"
    }
  ]
}
```

### 2. `get_time`

Get current time in a specific timezone (returns static demo data).

**Parameters:**

- `timezone` (required): Timezone code (e.g., "PST", "EST", "UTC")

**Supported Timezones:**

- UTC, PST, EST, GMT, JST, AEST

**Example:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What time is it in Tokyo?"
    }
  ]
}
```

## Usage with TanStack AI Client

This server is compatible with the TypeScript TanStack AI client:

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:8000/chat'),
})

await client.sendMessage('Hello!')
```

## StreamChunk Format

The `tanstack-ai` package emits the following `StreamChunk` types:

- **`content`**: Text content updates with delta and accumulated content
- **`tool_call`**: Tool/function call events with arguments
- **`tool_result`**: Results from tool execution
- **`done`**: Stream completion with finish reason and usage stats
- **`error`**: Error events
- **`tool-input-available`**: Tool inputs ready for client-side execution
- **`approval-requested`**: Tool requiring user approval

See `packages/python/tanstack-ai/src/tanstack_ai/types.py` for full type definitions.

## Agentic Flow

The server uses TanStack AI's agentic flow features:

1. **Tool Registration**: Tools are defined with JSON Schema and execute functions
2. **Automatic Execution**: When Claude calls a tool, it's automatically executed
3. **Result Injection**: Tool results are added to the conversation
4. **Loop Control**: Agent can iterate up to 5 times (configurable)
5. **Streaming**: All events (content, tool calls, results) are streamed to the client

```python
# Example tool definition
weather_tool = tool(
    name="get_weather",
    description="Get the current weather for a location",
    input_schema={
        "type": "object",
        "properties": {
            "location": {"type": "string"},
        },
        "required": ["location"],
    },
    execute=get_weather_impl,
)

# Use in chat with automatic execution
async for chunk in chat(
    adapter=adapter,
    model="claude-3-5-sonnet-20241022",
    messages=messages,
    tools=[weather_tool],
    agent_loop_strategy=max_iterations(5),
):
    yield format_sse_chunk(chunk)
```

## Supported Models

- ✅ **Anthropic** (Claude models) - fully implemented
  - claude-3-5-sonnet-20241022 (recommended for tool calling)
  - claude-3-5-haiku-20241022
  - claude-3-opus-20240229
  - And more...

## Project Structure

```
python-fastapi/
├── anthropic-server.py  # FastAPI server example
├── requirements.txt      # Python dependencies (includes tanstack-ai package)
├── env.example       # Environment variables template
└── README.md         # This file
```

## Architecture

The server uses the `tanstack-ai` Python SDK located at `packages/python/tanstack-ai/`:

```
FastAPI Server (anthropic-server.py)
    ↓
TanStack AI SDK (tanstack-ai package)
    ↓
AnthropicAdapter
    ↓
Claude API
```

**Key Components:**

- **`anthropic-server.py`**: FastAPI endpoints and HTTP streaming
- **`AnthropicAdapter`**: Converts Anthropic events to StreamChunks
- **`ChatEngine`**: Orchestrates the agentic loop
- **`ToolCallManager`**: Manages tool execution
- **`chat()` function**: Main entry point for agentic chat

The package is installed as an editable dependency, making development easy.

## Testing the Server

### With curl:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "What'\''s the weather in San Francisco and what time is it in Tokyo?"
      }
    ]
  }'
```

### With the TanStack AI Client:

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:8000/chat'),
})

await client.sendMessage("What's the weather in New York?")
```

## Notes

- The server uses CORS middleware allowing all origins (configure for production)
- Default model is `claude-3-5-sonnet-20241022` (better for tool calling)
- Tools are automatically executed on the server side
- Agent loop allows up to 5 iterations (configurable via `max_iterations`)
- Error handling converts exceptions to error StreamChunks
- All tool executions are logged for debugging
