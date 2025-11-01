"""
TanStack AI Python Package

Python utilities for converting AI provider events to TanStack AI StreamChunk format
and formatting messages between TanStack AI and provider formats.
"""

from .converter import StreamChunkConverter
from .message_formatters import format_messages_for_anthropic, format_messages_for_openai
from .sse import format_sse_chunk, format_sse_done, format_sse_error, stream_chunks_to_sse

__all__ = [
    "StreamChunkConverter",
    "format_messages_for_anthropic",
    "format_messages_for_openai",
    "format_sse_chunk",
    "format_sse_done",
    "format_sse_error",
    "stream_chunks_to_sse",
]

__version__ = "0.1.0"

