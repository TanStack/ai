"""
TanStack AI Python Package

Python SDK for building AI applications with streaming, tool calling, and agentic workflows.
Provides adapters for AI providers (Anthropic, OpenAI, etc.) and utilities for message
formatting and SSE streaming.
"""

# Core chat functionality
from .chat import chat, ChatEngine

# Adapters
from .base_adapter import BaseAdapter
from .anthropic_adapter import AnthropicAdapter

# Tool management
from .tool_manager import (
    ToolCallManager,
    execute_tool_calls,
    ToolResult,
    ApprovalRequest,
    ClientToolRequest,
    ExecuteToolCallsResult,
)
from .tool_utils import tool

# Agent strategies
from .agent_strategies import (
    max_iterations,
    until_finish_reason,
    combine_strategies,
)

# Types
from .types import (
    # Core types
    Tool,
    ToolCall,
    ModelMessage,
    ChatOptions,
    AIAdapterConfig,
    # Stream chunk types
    StreamChunk,
    ContentStreamChunk,
    ThinkingStreamChunk,
    ToolCallStreamChunk,
    ToolInputAvailableStreamChunk,
    ApprovalRequestedStreamChunk,
    ToolResultStreamChunk,
    DoneStreamChunk,
    ErrorStreamChunk,
    # Agent loop types
    AgentLoopState,
    AgentLoopStrategy,
    # Other types
    SummarizationOptions,
    SummarizationResult,
    EmbeddingOptions,
    EmbeddingResult,
)

# Legacy utilities (for backward compatibility)
from .converter import StreamChunkConverter
from .message_formatters import format_messages_for_anthropic, format_messages_for_openai
from .sse import format_sse_chunk, format_sse_done, format_sse_error, stream_chunks_to_sse

__all__ = [
    # Core chat
    "chat",
    "ChatEngine",
    # Adapters
    "BaseAdapter",
    "AnthropicAdapter",
    # Tool management
    "tool",
    "ToolCallManager",
    "execute_tool_calls",
    "ToolResult",
    "ApprovalRequest",
    "ClientToolRequest",
    "ExecuteToolCallsResult",
    # Agent strategies
    "max_iterations",
    "until_finish_reason",
    "combine_strategies",
    # Types
    "Tool",
    "ToolCall",
    "ModelMessage",
    "ChatOptions",
    "AIAdapterConfig",
    "StreamChunk",
    "ContentStreamChunk",
    "ThinkingStreamChunk",
    "ToolCallStreamChunk",
    "ToolInputAvailableStreamChunk",
    "ApprovalRequestedStreamChunk",
    "ToolResultStreamChunk",
    "DoneStreamChunk",
    "ErrorStreamChunk",
    "AgentLoopState",
    "AgentLoopStrategy",
    "SummarizationOptions",
    "SummarizationResult",
    "EmbeddingOptions",
    "EmbeddingResult",
    # Legacy utilities
    "StreamChunkConverter",
    "format_messages_for_anthropic",
    "format_messages_for_openai",
    "format_sse_chunk",
    "format_sse_done",
    "format_sse_error",
    "stream_chunks_to_sse",
]

__version__ = "0.1.0"

