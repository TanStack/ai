"""
Server-Sent Events (SSE) formatting utilities for TanStack AI

Provides utilities for formatting StreamChunk objects into SSE-compatible
event stream format for HTTP responses.
"""
import json
from typing import Dict, Any, AsyncIterator, Iterator, Union


def format_sse_chunk(chunk: Dict[str, Any]) -> str:
    """
    Format a StreamChunk dictionary as an SSE data line.
    
    Args:
        chunk: StreamChunk dictionary to format
        
    Returns:
        SSE-formatted string (e.g., "data: {...}\n\n")
    """
    return f"data: {json.dumps(chunk)}\n\n"


def format_sse_done() -> str:
    """
    Format the SSE completion marker.
    
    Returns:
        SSE completion marker (e.g., "data: [DONE]\n\n")
    """
    return "data: [DONE]\n\n"


def format_sse_error(error: Exception) -> str:
    """
    Format an error as an SSE error chunk.
    
    Args:
        error: Exception to format
        
    Returns:
        SSE-formatted error chunk
    """
    error_chunk = {
        "type": "error",
        "error": {
            "type": type(error).__name__,
            "message": str(error)
        }
    }
    return format_sse_chunk(error_chunk)


async def stream_chunks_to_sse(
    chunks: Union[AsyncIterator[Dict[str, Any]], Iterator[Dict[str, Any]]]
) -> AsyncIterator[str]:
    """
    Convert an async iterator of StreamChunk dictionaries to SSE format.
    
    Args:
        chunks: Async iterator or regular iterator of StreamChunk dictionaries
        
    Yields:
        SSE-formatted strings
    """
    if hasattr(chunks, '__aiter__'):
        # Async iterator
        async for chunk in chunks:
            yield format_sse_chunk(chunk)
    else:
        # Regular iterator
        for chunk in chunks:
            yield format_sse_chunk(chunk)
    
    yield format_sse_done()

