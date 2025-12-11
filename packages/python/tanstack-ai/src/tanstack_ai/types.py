"""
Type definitions for TanStack AI Python package.

This module defines the core types used throughout the package, following the
AG-UI (Agent-User Interface) protocol for consistent event streaming.
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
# AG-UI Protocol Event Types
# ============================================================================

EventType = Literal[
    "RUN_STARTED",
    "RUN_FINISHED",
    "RUN_ERROR",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "TOOL_CALL_START",
    "TOOL_CALL_ARGS",
    "TOOL_CALL_END",
    "STEP_STARTED",
    "STEP_FINISHED",
    "STATE_SNAPSHOT",
    "STATE_DELTA",
    "CUSTOM",
]


class BaseEvent(TypedDict, total=False):
    """Base structure for all AG-UI events."""

    type: EventType
    timestamp: int  # Unix timestamp in milliseconds
    model: Optional[str]  # TanStack AI addition
    rawEvent: Optional[Any]  # Original provider event


class UsageInfo(TypedDict, total=False):
    """Token usage information."""

    promptTokens: int
    completionTokens: int
    totalTokens: int


class ErrorInfo(TypedDict, total=False):
    """Error information."""

    message: str
    code: Optional[str]


class RunStartedEvent(BaseEvent):
    """Emitted when a run starts."""

    runId: str
    threadId: Optional[str]


class RunFinishedEvent(BaseEvent):
    """Emitted when a run completes successfully."""

    runId: str
    finishReason: Optional[Literal["stop", "length", "content_filter", "tool_calls"]]
    usage: Optional[UsageInfo]


class RunErrorEvent(BaseEvent):
    """Emitted when an error occurs during a run."""

    runId: Optional[str]
    error: ErrorInfo


class TextMessageStartEvent(BaseEvent):
    """Emitted when a text message starts."""

    messageId: str
    role: Literal["assistant"]


class TextMessageContentEvent(BaseEvent):
    """Emitted when text content is generated (streaming tokens)."""

    messageId: str
    delta: str
    content: Optional[str]  # Full accumulated content so far


class TextMessageEndEvent(BaseEvent):
    """Emitted when a text message completes."""

    messageId: str


class ApprovalInfo(TypedDict, total=False):
    """Approval metadata for tools requiring user approval."""

    id: str
    needsApproval: bool


class ToolCallStartEvent(BaseEvent):
    """Emitted when a tool call starts."""

    toolCallId: str
    toolName: str
    index: Optional[int]
    approval: Optional[ApprovalInfo]


class ToolCallArgsEvent(BaseEvent):
    """Emitted when tool call arguments are streaming."""

    toolCallId: str
    delta: str  # Incremental JSON arguments delta
    args: Optional[str]  # Full accumulated arguments


class ToolCallEndEvent(BaseEvent):
    """Emitted when a tool call completes (with optional result)."""

    toolCallId: str
    toolName: str
    input: Optional[Any]  # Final parsed input arguments
    result: Optional[str]  # Tool execution result


class StepStartedEvent(BaseEvent):
    """Emitted when a reasoning/thinking step starts."""

    stepId: str
    stepType: Literal["thinking", "reasoning", "planning"]


class StepFinishedEvent(BaseEvent):
    """Emitted when a reasoning/thinking step completes or streams content."""

    stepId: str
    delta: Optional[str]  # Incremental thinking token
    content: str  # Full accumulated thinking content


class StateDeltaOp(TypedDict):
    """A single state delta operation."""

    op: Literal["add", "remove", "replace"]
    path: str
    value: Optional[Any]


class StateSnapshotEvent(BaseEvent):
    """Emitted for full state synchronization."""

    state: Dict[str, Any]


class StateDeltaEvent(BaseEvent):
    """Emitted for incremental state updates."""

    delta: List[StateDeltaOp]


class CustomEvent(BaseEvent):
    """Custom event for extensibility."""

    name: str
    value: Any


# Union type for all AG-UI events
StreamChunk = Union[
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
