# TanStack AI Python SDK

Python SDK for building AI applications with streaming, tool calling, and agentic workflows. Provides adapters for AI providers (Anthropic, OpenAI, etc.) and utilities for message formatting and SSE streaming.

## Features

- 🤖 **Agentic Workflows** - Automatic tool execution loops with customizable strategies
- 🔧 **Tool Calling** - Define and execute tools with JSON Schema validation
- 📡 **Streaming** - Full support for streaming chat completions
- 🔌 **Multiple Adapters** - Support for Anthropic (Claude), with more providers coming soon
- 🛡️ **Type Safety** - Comprehensive type hints using TypedDict and dataclasses
- 📋 **Protocol Compliant** - Follows the TanStack AI StreamChunk protocol

## Installation

```bash
pip install tanstack-ai anthropic
```

Or install from source:

```bash
cd packages/python/tanstack-ai
pip install -e .
```

## Quick Start

### Basic Chat

```python
import asyncio
from tanstack_ai import AnthropicAdapter, AIAdapterConfig, chat

async def main():
    adapter = AnthropicAdapter(
        AIAdapterConfig(api_key="your-api-key")
    )

    async for chunk in chat(
        adapter=adapter,
        model="claude-3-5-sonnet-20241022",
        messages=[{"role": "user", "content": "Hello!"}],
    ):
        if chunk["type"] == "content":
            print(chunk["delta"], end="", flush=True)

asyncio.run(main())
```

### Chat with Tools (Agentic Flow)

```python
from tanstack_ai import chat, tool, max_iterations

# Define a tool
weather_tool = tool(
    name="get_weather",
    description="Get the current weather for a location",
    input_schema={
        "type": "object",
        "properties": {
            "location": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
        },
        "required": ["location"],
    },
    execute=lambda args: {
        "temperature": 72,
        "conditions": "sunny",
        "location": args["location"],
    },
)

# Use the tool in chat
async for chunk in chat(
    adapter=adapter,
    model="claude-3-5-sonnet-20241022",
    messages=[
        {"role": "user", "content": "What's the weather in San Francisco?"}
    ],
    tools=[weather_tool],
    agent_loop_strategy=max_iterations(5),
):
    if chunk["type"] == "content":
        print(chunk["delta"], end="", flush=True)
    elif chunk["type"] == "tool_call":
        print(f"\n[Calling: {chunk['toolCall']['function']['name']}]")
```

See `example_usage.py` and `AGENTIC_FEATURES.md` for more examples.

## Usage

### StreamChunkConverter

Convert provider streaming events to TanStack AI StreamChunk format:

```python
from tanstack_ai import StreamChunkConverter

converter = StreamChunkConverter(model="claude-3-haiku-20240307", provider="anthropic")

async for event in anthropic_stream:
    chunks = await converter.convert_event(event)
    for chunk in chunks:
        # Process StreamChunk
        pass
```

### Message Formatters

Convert TanStack AI messages to provider formats:

```python
from tanstack_ai import format_messages_for_anthropic, format_messages_for_openai

# Convert to Anthropic format
system_message, anthropic_messages = format_messages_for_anthropic(messages)

# Convert to OpenAI format
openai_messages = format_messages_for_openai(messages)
```

### SSE Formatting Utilities

Format StreamChunk dictionaries as Server-Sent Events (SSE) for HTTP responses:

```python
from tanstack_ai import format_sse_chunk, format_sse_done, format_sse_error

# Format a chunk
sse_data = format_sse_chunk(chunk)  # Returns "data: {...}\n\n"

# Format completion marker
sse_done = format_sse_done()  # Returns "data: [DONE]\n\n"

# Format an error
sse_error = format_sse_error(exception)  # Returns formatted error chunk
```

Example usage in FastAPI:

```python
async def generate_stream():
    async for event in stream:
        chunks = await converter.convert_event(event)
        for chunk in chunks:
            yield format_sse_chunk(chunk)
    yield format_sse_done()
```

## Core API

### chat()

Stream chat completions with automatic tool execution:

```python
async for chunk in chat(
    adapter=adapter,           # AI adapter instance
    model="model-name",        # Model identifier
    messages=[...],            # Conversation messages
    tools=[...],               # Optional tools (auto-executed)
    agent_loop_strategy=...,   # Optional loop control strategy
    options={...},             # Common options (temperature, etc.)
    provider_options={...},    # Provider-specific options
):
    # Handle StreamChunk
    pass
```

### tool()

Define a tool with JSON Schema:

```python
my_tool = tool(
    name="tool_name",
    description="What the tool does",
    input_schema={...},        # JSON Schema for inputs
    execute=lambda args: ...,  # Function to execute
    needs_approval=False,      # Require user approval
)
```

### Agent Loop Strategies

Control how the agent loop behaves:

```python
from tanstack_ai import (
    max_iterations,           # Limit iterations
    until_finish_reason,      # Stop on specific reasons
    combine_strategies,       # Combine multiple strategies
)

# Max 10 iterations
strategy = max_iterations(10)

# Stop on specific finish reasons
strategy = until_finish_reason(["stop", "length"])

# Custom logic
strategy = lambda state: len(state["messages"]) < 50

# Combine strategies
strategy = combine_strategies([
    max_iterations(10),
    until_finish_reason(["stop"]),
])
```

## Adapters

### AnthropicAdapter

```python
from tanstack_ai import AnthropicAdapter, AIAdapterConfig

adapter = AnthropicAdapter(
    AIAdapterConfig(
        api_key="your-api-key",
        base_url=None,           # Optional custom base URL
        timeout=None,            # Optional timeout
        max_retries=None,        # Optional max retries
    )
)
```

**Supported Models:**

- claude-3-5-sonnet-20241022
- claude-3-5-sonnet-20240620
- claude-3-5-haiku-20241022
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307

## StreamChunk Protocol

All streaming responses emit `StreamChunk` objects with these types:

- `content` - Text content being generated
- `thinking` - Model's reasoning process (when supported)
- `tool_call` - Model calling a tool
- `tool_result` - Result from tool execution
- `tool-input-available` - Tool inputs ready for client execution
- `approval-requested` - Tool requires approval
- `done` - Stream completion
- `error` - Error occurred

See `docs/protocol/chunk-definitions.md` for detailed specifications.

## Supported Providers

- ✅ Anthropic (Claude models)
- 🔄 OpenAI (coming soon)
- 🔄 Gemini (coming soon)
- 🔄 Ollama (coming soon)

## Examples

See these files for complete examples:

- `example_usage.py` - Basic usage examples
- `AGENTIC_FEATURES.md` - Detailed documentation of agentic features

## License

MIT
