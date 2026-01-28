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
# AG-UI Protocol Event Types
# ============================================================================

"""
AG-UI (Agent-User Interaction) Protocol event types.
Based on the AG-UI specification for agent-user interaction.
@see https://docs.ag-ui.com/concepts/events
"""

AGUIEventType = Literal[
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

# Stream chunk/event types (AG-UI protocol)
StreamChunkType = AGUIEventType


class UsageInfo(TypedDict, total=False):
    """Token usage information."""

    promptTokens: int
    completionTokens: int
    totalTokens: int


class ErrorInfo(TypedDict, total=False):
    """Error information."""

    message: str
    code: Optional[str]


# ============================================================================
# AG-UI Event Interfaces
# ============================================================================


class BaseAGUIEvent(TypedDict, total=False):
    """Base structure for AG-UI events."""

    type: AGUIEventType
    timestamp: int  # Unix timestamp in milliseconds
    model: Optional[str]
    rawEvent: Optional[Any]


class RunStartedEvent(TypedDict):
    """Emitted when a run starts. This is the first event in any streaming response."""

    type: Literal["RUN_STARTED"]
    runId: str
    timestamp: int
    model: Optional[str]
    threadId: Optional[str]


class RunFinishedEvent(TypedDict, total=False):
    """Emitted when a run completes successfully."""

    type: Literal["RUN_FINISHED"]
    runId: str
    timestamp: int
    model: Optional[str]
    finishReason: Optional[Literal["stop", "length", "content_filter", "tool_calls"]]
    usage: Optional[UsageInfo]


class RunErrorEvent(TypedDict, total=False):
    """Emitted when an error occurs during a run."""

    type: Literal["RUN_ERROR"]
    runId: Optional[str]
    timestamp: int
    model: Optional[str]
    error: ErrorInfo


class TextMessageStartEvent(TypedDict):
    """Emitted when a text message starts."""

    type: Literal["TEXT_MESSAGE_START"]
    messageId: str
    timestamp: int
    model: Optional[str]
    role: Literal["assistant"]


class TextMessageContentEvent(TypedDict, total=False):
    """Emitted when text content is generated (streaming tokens)."""

    type: Literal["TEXT_MESSAGE_CONTENT"]
    messageId: str
    timestamp: int
    model: Optional[str]
    delta: str
    content: Optional[str]


class TextMessageEndEvent(TypedDict):
    """Emitted when a text message completes."""

    type: Literal["TEXT_MESSAGE_END"]
    messageId: str
    timestamp: int
    model: Optional[str]


class ToolCallStartEvent(TypedDict, total=False):
    """Emitted when a tool call starts."""

    type: Literal["TOOL_CALL_START"]
    toolCallId: str
    toolName: str
    timestamp: int
    model: Optional[str]
    index: Optional[int]


class ToolCallArgsEvent(TypedDict, total=False):
    """Emitted when tool call arguments are streaming."""

    type: Literal["TOOL_CALL_ARGS"]
    toolCallId: str
    timestamp: int
    model: Optional[str]
    delta: str
    args: Optional[str]


class ToolCallEndEvent(TypedDict, total=False):
    """Emitted when a tool call completes."""

    type: Literal["TOOL_CALL_END"]
    toolCallId: str
    toolName: str
    timestamp: int
    model: Optional[str]
    input: Optional[Any]
    result: Optional[str]


class StepStartedEvent(TypedDict, total=False):
    """Emitted when a thinking/reasoning step starts."""

    type: Literal["STEP_STARTED"]
    stepId: str
    timestamp: int
    model: Optional[str]
    stepType: Optional[str]


class StepFinishedEvent(TypedDict, total=False):
    """Emitted when a thinking/reasoning step finishes."""

    type: Literal["STEP_FINISHED"]
    stepId: str
    timestamp: int
    model: Optional[str]
    delta: Optional[str]
    content: Optional[str]


class StateSnapshotEvent(TypedDict):
    """Emitted to provide a full state snapshot."""

    type: Literal["STATE_SNAPSHOT"]
    timestamp: int
    model: Optional[str]
    state: Dict[str, Any]


class StateDeltaEvent(TypedDict):
    """Emitted to provide an incremental state update."""

    type: Literal["STATE_DELTA"]
    timestamp: int
    model: Optional[str]
    delta: Dict[str, Any]


class CustomEvent(TypedDict, total=False):
    """Custom event for extensibility."""

    type: Literal["CUSTOM"]
    timestamp: int
    model: Optional[str]
    name: str
    data: Optional[Any]


# Union of all AG-UI events
AGUIEvent = Union[
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


# Stream chunks use AG-UI event format
StreamChunk = AGUIEvent


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
