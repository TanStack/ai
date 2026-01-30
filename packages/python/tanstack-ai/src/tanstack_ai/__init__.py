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
    # AG-UI Event types
    AGUIEventType,
    AGUIEvent,
    RunStartedEvent,
    RunFinishedEvent,
    RunErrorEvent,
    TextMessageStartEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    ToolCallStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    StepStartedEvent,
    StepFinishedEvent,
    StateSnapshotEvent,
    StateDeltaEvent,
    CustomEvent,
    StreamChunk,
    # Agent loop types
    AgentLoopState,
    AgentLoopStrategy,
    # Other types
    UsageInfo,
    ErrorInfo,
    SummarizationOptions,
    SummarizationResult,
    EmbeddingOptions,
    EmbeddingResult,
)

# Utilities
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
    # AG-UI Event Types
    "AGUIEventType",
    "AGUIEvent",
    "RunStartedEvent",
    "RunFinishedEvent",
    "RunErrorEvent",
    "TextMessageStartEvent",
    "TextMessageContentEvent",
    "TextMessageEndEvent",
    "ToolCallStartEvent",
    "ToolCallArgsEvent",
    "ToolCallEndEvent",
    "StepStartedEvent",
    "StepFinishedEvent",
    "StateSnapshotEvent",
    "StateDeltaEvent",
    "CustomEvent",
    "StreamChunk",
    # Core Types
    "Tool",
    "ToolCall",
    "ModelMessage",
    "ChatOptions",
    "AIAdapterConfig",
    "UsageInfo",
    "ErrorInfo",
    # Agent Loop Types
    "AgentLoopState",
    "AgentLoopStrategy",
    # Other Types
    "SummarizationOptions",
    "SummarizationResult",
    "EmbeddingOptions",
    "EmbeddingResult",
    # Utilities
    "StreamChunkConverter",
    "format_messages_for_anthropic",
    "format_messages_for_openai",
    "format_sse_chunk",
    "format_sse_done",
    "format_sse_error",
    "stream_chunks_to_sse",
]

__version__ = "0.1.0"

