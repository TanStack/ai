"""
Type definitions for TanStack AI Python package.

This module defines the core types used throughout the package, mirroring the
TypeScript implementation for consistency across platforms.
"""

from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Protocol,
    TypedDict,
    Union,
)


# ============================================================================
# Tool and Function Call Types
# ============================================================================


class ToolCallFunction(TypedDict):
    """Function details within a tool call."""

    name: str
    arguments: str  # JSON string


class ToolCall(TypedDict):
    """Tool/function call from the model."""

    id: str
    type: Literal["function"]
    function: ToolCallFunction


class ModelMessage(TypedDict, total=False):
    """Message in the conversation."""

    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str]
    name: Optional[str]
    toolCalls: Optional[List[ToolCall]]
    toolCallId: Optional[str]


@dataclass
class Tool:
    """
    Tool/Function definition for function calling.

    Tools allow the model to interact with external systems, APIs, or perform computations.
    The model will decide when to call tools based on the user's request and the tool descriptions.
    """

    name: str
    """Unique name of the tool (used by the model to call it)."""

    description: str
    """Clear description of what the tool does (crucial for model decision-making)."""

    input_schema: Optional[Dict[str, Any]] = None
    """JSON Schema describing the tool's input parameters."""

    output_schema: Optional[Dict[str, Any]] = None
    """Optional JSON Schema for validating tool output."""

    execute: Optional[Callable[[Dict[str, Any]], Any]] = None
    """
    Optional async function to execute when the model calls this tool.
    If provided, the SDK will automatically execute the function and feed the result back to the model.
    """

    needs_approval: bool = False
    """If true, tool execution requires user approval before running."""

    metadata: Dict[str, Any] = field(default_factory=dict)
    """Additional metadata for adapters or custom extensions."""


# ============================================================================
# Stream Chunk Types
# ============================================================================


StreamChunkType = Literal[
    "content",
    "thinking",
    "tool_call",
    "tool-input-available",
    "approval-requested",
    "tool_result",
    "done",
    "error",
]


class BaseStreamChunk(TypedDict):
    """Base structure for all stream chunks."""

    type: StreamChunkType
    id: str
    model: str
    timestamp: int  # Unix timestamp in milliseconds


class ContentStreamChunk(BaseStreamChunk):
    """Emitted when the model generates text content."""

    delta: str  # The incremental content token
    content: str  # Full accumulated content so far
    role: Optional[Literal["assistant"]]


class ThinkingStreamChunk(BaseStreamChunk):
    """Emitted when the model exposes its reasoning process."""

    delta: Optional[str]  # The incremental thinking token
    content: str  # Full accumulated thinking content so far


class ToolCallStreamChunk(BaseStreamChunk):
    """Emitted when the model decides to call a tool/function."""

    toolCall: ToolCall
    index: int  # Index of this tool call (for parallel calls)


class ToolInputAvailableStreamChunk(BaseStreamChunk):
    """Emitted when tool inputs are complete and ready for client-side execution."""

    toolCallId: str
    toolName: str
    input: Any  # Parsed tool arguments


class ApprovalRequestedStreamChunk(BaseStreamChunk):
    """Emitted when a tool requires user approval before execution."""

    toolCallId: str
    toolName: str
    input: Any
    approval: Dict[str, Any]  # Contains 'id' and 'needsApproval'


class ToolResultStreamChunk(BaseStreamChunk):
    """Emitted when a tool execution completes."""

    toolCallId: str
    content: str  # Result of the tool execution (JSON stringified)


class UsageInfo(TypedDict, total=False):
    """Token usage information."""

    promptTokens: int
    completionTokens: int
    totalTokens: int


class DoneStreamChunk(BaseStreamChunk):
    """Emitted when the stream completes successfully."""

    finishReason: Optional[Literal["stop", "length", "content_filter", "tool_calls"]]
    usage: Optional[UsageInfo]


class ErrorInfo(TypedDict, total=False):
    """Error information."""

    message: str
    code: Optional[str]


class ErrorStreamChunk(BaseStreamChunk):
    """Emitted when an error occurs during streaming."""

    error: ErrorInfo


# Union type for all stream chunks
StreamChunk = Union[
    ContentStreamChunk,
    ThinkingStreamChunk,
    ToolCallStreamChunk,
    ToolInputAvailableStreamChunk,
    ApprovalRequestedStreamChunk,
    ToolResultStreamChunk,
    DoneStreamChunk,
    ErrorStreamChunk,
]


# ============================================================================
# Agent Loop Types
# ============================================================================


class AgentLoopState(TypedDict):
    """State passed to agent loop strategy for determining whether to continue."""

    iterationCount: int  # Current iteration count (0-indexed)
    messages: List[ModelMessage]  # Current messages array
    finishReason: Optional[str]  # Finish reason from the last response


AgentLoopStrategy = Callable[[AgentLoopState], bool]
"""
Strategy function that determines whether the agent loop should continue.
Returns True to continue looping, False to stop.
"""


# ============================================================================
# Chat Options
# ============================================================================


@dataclass
class ChatOptions:
    """Options for chat requests."""

    model: str
    messages: List[ModelMessage]
    tools: Optional[List[Tool]] = None
    system_prompts: Optional[List[str]] = None
    agent_loop_strategy: Optional[AgentLoopStrategy] = None
    options: Optional[Dict[str, Any]] = None  # Common options (temperature, etc.)
    provider_options: Optional[Dict[str, Any]] = None  # Provider-specific options
    abort_signal: Optional[Any] = None  # For request cancellation


# ============================================================================
# Adapter Configuration
# ============================================================================


@dataclass
class AIAdapterConfig:
    """Configuration for AI adapters."""

    api_key: Optional[str] = None
    base_url: Optional[str] = None
    timeout: Optional[float] = None
    max_retries: Optional[int] = None
    headers: Optional[Dict[str, str]] = None


# ============================================================================
# Results and Options for other endpoints
# ============================================================================


@dataclass
class SummarizationOptions:
    """Options for summarization requests."""

    model: str
    text: str
    max_length: Optional[int] = None
    style: Optional[Literal["bullet-points", "paragraph", "concise"]] = None
    focus: Optional[List[str]] = None


@dataclass
class SummarizationResult:
    """Result from summarization."""

    id: str
    model: str
    summary: str
    usage: UsageInfo


@dataclass
class EmbeddingOptions:
    """Options for embedding requests."""

    model: str
    input: Union[str, List[str]]
    dimensions: Optional[int] = None


@dataclass
class EmbeddingResult:
    """Result from embedding."""

    id: str
    model: str
    embeddings: List[List[float]]
    usage: UsageInfo
