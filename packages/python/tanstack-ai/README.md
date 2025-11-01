# TanStack AI

Python utilities for converting AI provider events to TanStack AI StreamChunk format and formatting messages between TanStack AI and provider formats.

## Installation

```bash
pip install tanstack-ai
```

Or install from source:

```bash
cd packages/python/tanstack-ai
pip install -e .
```

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

## Supported Providers

- Anthropic (Claude models)
- OpenAI (GPT models)

## License

MIT

