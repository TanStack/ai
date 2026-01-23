"""
Server-Sent Events (SSE) formatting utilities for TanStack AI

Provides utilities for formatting AG-UI StreamChunk objects into SSE-compatible
event stream format for HTTP responses.
"""
import json
import secrets
import time
from typing import Dict, Any, AsyncIterator, Iterator, Optional, Union


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


def format_sse_error(
    error: Exception,
    run_id: Optional[str] = None,
    model: Optional[str] = None
) -> str:
    """
    Format an error as an SSE RUN_ERROR chunk (AG-UI Protocol).
    
    Args:
        error: Exception to format
        run_id: Optional run ID for correlation
        model: Optional model name
        
    Returns:
        SSE-formatted RUN_ERROR chunk
    """
    error_chunk = {
        "type": "RUN_ERROR",
        "runId": run_id or f"run-{secrets.token_hex(4)}",
        "model": model,
        "timestamp": int(time.time() * 1000),
        "error": {
            "message": str(error),
            "code": getattr(error, "code", None) or type(error).__name__,
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

