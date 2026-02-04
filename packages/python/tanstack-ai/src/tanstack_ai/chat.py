"""
Chat functionality with automatic tool execution loop.

This module provides the main chat() function and ChatEngine class that
orchestrate the agentic flow with tool calling support.
"""

import json
import time
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional

from .agent_strategies import max_iterations
from .base_adapter import BaseAdapter
from .tool_manager import (
    ApprovalRequest,
    ClientToolRequest,
    ExecuteToolCallsResult,
    ToolCallManager,
    ToolResult,
    execute_tool_calls,
)
from .types import (
    AgentLoopStrategy,
    ChatOptions,
    CustomEvent,
    ModelMessage,
    RunFinishedEvent,
    StreamChunk,
    Tool,
    ToolCall,
    ToolCallEndEvent,
)


class CyclePhase(str, Enum):
    """Phase of the agent cycle."""

    PROCESS_CHAT = "processChat"
    EXECUTE_TOOL_CALLS = "executeToolCalls"


class ToolPhaseResult(str, Enum):
    """Result from tool execution phase."""

    CONTINUE = "continue"
    STOP = "stop"
    WAIT = "wait"


def _prepend_system_prompts(
    messages: List[ModelMessage],
    system_prompts: Optional[List[str]] = None,
    default_prompts: Optional[List[str]] = None,
) -> List[ModelMessage]:
    """
    Prepend system prompts to messages.

    Args:
        messages: Existing messages
        system_prompts: Optional system prompts to prepend
        default_prompts: Default prompts to use if system_prompts is empty

    Returns:
        Messages with system prompts prepended
    """
    prompts = system_prompts if system_prompts else (default_prompts or [])

    if not prompts:
        return messages

    system_messages: List[ModelMessage] = [
        {"role": "system", "content": content} for content in prompts
    ]

    return system_messages + messages


class ChatEngine:
    """
    Orchestrates the chat loop with automatic tool execution.

    This class manages the conversation state, handles the agentic loop,
    executes tool calls, and emits appropriate stream chunks.
    """

    def __init__(
        self,
        adapter: BaseAdapter,
        options: ChatOptions,
        system_prompts: Optional[List[str]] = None,
    ):
        """
        Initialize the chat engine.

        Args:
            adapter: AI adapter to use
            options: Chat options
            system_prompts: Optional default system prompts
        """
        self.adapter = adapter
        self.options = options
        self.system_prompts = system_prompts or []
        self.tools: List[Tool] = options.tools or []
        self.loop_strategy: AgentLoopStrategy = (
            options.agent_loop_strategy or max_iterations(5)
        )
        self.tool_call_manager = ToolCallManager(self.tools)
        self.initial_message_count = len(options.messages)

        # State
        self.messages = _prepend_system_prompts(
            options.messages,
            options.system_prompts,
            self.system_prompts,
        )
        self.iteration_count = 0
        self.last_finish_reason: Optional[str] = None
        self.current_message_id: Optional[str] = None
        self.accumulated_content = ""
        self.finished_event: Optional[RunFinishedEvent] = None
        self.should_emit_stream_end = True
        self.early_termination = False
        self.tool_phase: ToolPhaseResult = ToolPhaseResult.CONTINUE
        self.cycle_phase: CyclePhase = CyclePhase.PROCESS_CHAT

        # Generate IDs
        self.request_id = self._create_id("chat")
        self.stream_id = self._create_id("stream")

    async def chat(self) -> AsyncIterator[StreamChunk]:
        """
        Main chat loop with automatic tool execution.

        Yields:
            StreamChunk objects
        """
        try:
            # Check for pending tool calls first
            async for chunk in self._check_for_pending_tool_calls():
                yield chunk

            if self.tool_phase == ToolPhaseResult.WAIT:
                return

            # Main agentic loop
            while self._should_continue():
                if self.early_termination:
                    return

                self._begin_cycle()

                if self.cycle_phase == CyclePhase.PROCESS_CHAT:
                    async for chunk in self._stream_model_response():
                        yield chunk
                else:
                    async for chunk in self._process_tool_calls():
                        yield chunk

                self._end_cycle()

        finally:
            pass

    def _begin_cycle(self) -> None:
        """Begin a cycle (either chat or tool execution)."""
        if self.cycle_phase == CyclePhase.PROCESS_CHAT:
            self._begin_iteration()

    def _end_cycle(self) -> None:
        """End a cycle and switch phase."""
        if self.cycle_phase == CyclePhase.PROCESS_CHAT:
            self.cycle_phase = CyclePhase.EXECUTE_TOOL_CALLS
            return

        self.cycle_phase = CyclePhase.PROCESS_CHAT
        self.iteration_count += 1

    def _begin_iteration(self) -> None:
        """Begin a new iteration."""
        self.current_message_id = self._create_id("msg")
        self.accumulated_content = ""
        self.finished_event = None

    async def _stream_model_response(self) -> AsyncIterator[StreamChunk]:
        """
        Stream response from the model.

        Yields:
            StreamChunk objects
        """
        # Create chat options for the adapter
        adapter_options = ChatOptions(
            model=self.options.model,
            messages=self.messages,
            tools=self.tools,
            options=self.options.options,
            provider_options=self.options.provider_options,
        )

        async for chunk in self.adapter.chat_stream(adapter_options):
            yield chunk
            self._handle_stream_chunk(chunk)

            if self.early_termination:
                break

    def _handle_stream_chunk(self, chunk: StreamChunk) -> None:
        """
        Handle a stream chunk and update state.

        Args:
            chunk: Stream chunk to handle
        """
        chunk_type = chunk.get("type")

        if chunk_type == "TEXT_MESSAGE_CONTENT":
            if chunk.get("content"):
                self.accumulated_content = chunk["content"]
            else:
                self.accumulated_content += chunk.get("delta", "")
        elif chunk_type == "TOOL_CALL_START":
            self.tool_call_manager.add_tool_call_start_event(chunk)
        elif chunk_type == "TOOL_CALL_ARGS":
            self.tool_call_manager.add_tool_call_args_event(chunk)
        elif chunk_type == "RUN_FINISHED":
            self._handle_run_finished_event(chunk)
        elif chunk_type == "RUN_ERROR":
            self.early_termination = True
            self.should_emit_stream_end = False

    def _handle_run_finished_event(self, chunk: RunFinishedEvent) -> None:
        """Handle a RUN_FINISHED event."""
        # Don't overwrite a tool_calls finishReason with a stop finishReason
        if (
            self.finished_event
            and self.finished_event.get("finishReason") == "tool_calls"
            and chunk.get("finishReason") == "stop"
        ):
            self.last_finish_reason = chunk.get("finishReason")
            return

        self.finished_event = chunk
        self.last_finish_reason = chunk.get("finishReason")

    async def _check_for_pending_tool_calls(self) -> AsyncIterator[StreamChunk]:
        """
        Check for pending tool calls in messages and execute them.

        Yields:
            StreamChunk objects
        """
        pending_tool_calls = self._get_pending_tool_calls_from_messages()
        if not pending_tool_calls:
            return

        finish_event = self._create_synthetic_finished_event()

        # Collect client state
        approvals, client_tool_results = self._collect_client_state()

        # Execute tool calls
        execution_result = await execute_tool_calls(
            pending_tool_calls,
            self.tools,
            approvals,
            client_tool_results,
        )

        # Handle approval requests
        if execution_result.needs_approval or execution_result.needs_client_execution:
            async for chunk in self._emit_approval_requests(
                execution_result.needs_approval, finish_event
            ):
                yield chunk

            async for chunk in self._emit_client_tool_inputs(
                execution_result.needs_client_execution, finish_event
            ):
                yield chunk

            self.should_emit_stream_end = False
            self.tool_phase = ToolPhaseResult.WAIT
            return

        # Emit tool results
        async for chunk in self._emit_tool_results(execution_result.results, finish_event):
            yield chunk

    async def _process_tool_calls(self) -> AsyncIterator[StreamChunk]:
        """
        Process tool calls from the current iteration.

        Yields:
            StreamChunk objects
        """
        if not self._should_execute_tool_phase():
            self._set_tool_phase(ToolPhaseResult.STOP)
            return

        tool_calls = self.tool_call_manager.get_tool_calls()
        finish_event = self.finished_event

        if not finish_event or not tool_calls:
            self._set_tool_phase(ToolPhaseResult.STOP)
            return

        # Add assistant message with tool calls
        self._add_assistant_tool_call_message(tool_calls)

        # Collect client state
        approvals, client_tool_results = self._collect_client_state()

        # Execute tool calls
        execution_result = await execute_tool_calls(
            tool_calls,
            self.tools,
            approvals,
            client_tool_results,
        )

        # Handle approval requests
        if execution_result.needs_approval or execution_result.needs_client_execution:
            async for chunk in self._emit_approval_requests(
                execution_result.needs_approval, finish_event
            ):
                yield chunk

            async for chunk in self._emit_client_tool_inputs(
                execution_result.needs_client_execution, finish_event
            ):
                yield chunk

            self._set_tool_phase(ToolPhaseResult.WAIT)
            return

        # Emit tool results
        async for chunk in self._emit_tool_results(execution_result.results, finish_event):
            yield chunk

        self.tool_call_manager.clear()
        self._set_tool_phase(ToolPhaseResult.CONTINUE)

    def _should_execute_tool_phase(self) -> bool:
        """Check if we should execute the tool phase."""
        return (
            self.finished_event is not None
            and self.finished_event.get("finishReason") == "tool_calls"
            and len(self.tools) > 0
            and self.tool_call_manager.has_tool_calls()
        )

    def _add_assistant_tool_call_message(self, tool_calls: List[ToolCall]) -> None:
        """Add an assistant message with tool calls to the conversation."""
        message: ModelMessage = {
            "role": "assistant",
            "content": self.accumulated_content or None,
            "toolCalls": tool_calls,
        }
        self.messages.append(message)

    def _collect_client_state(self) -> tuple[Dict[str, bool], Dict[str, Any]]:
        """
        Collect approval decisions and client tool results from messages.

        Returns:
            Tuple of (approvals map, client tool results map)
        """
        approvals: Dict[str, bool] = {}
        client_tool_results: Dict[str, Any] = {}

        # TODO: Parse message parts for approval state and client results
        # This would require extending ModelMessage to support parts

        return approvals, client_tool_results

    async def _emit_approval_requests(
        self,
        approval_requests: List[ApprovalRequest],
        finish_event: RunFinishedEvent,
    ) -> AsyncIterator[StreamChunk]:
        """Emit approval request events using CUSTOM event type."""
        for approval in approval_requests:
            chunk: CustomEvent = {
                "type": "CUSTOM",
                "timestamp": int(time.time() * 1000),
                "model": finish_event.get("model"),
                "name": "approval-requested",
                "data": {
                    "toolCallId": approval.tool_call_id,
                    "toolName": approval.tool_name,
                    "input": approval.input,
                    "approval": {
                        "id": approval.approval_id,
                        "needsApproval": True,
                    },
                },
            }
            yield chunk

    async def _emit_client_tool_inputs(
        self,
        client_requests: List[ClientToolRequest],
        finish_event: RunFinishedEvent,
    ) -> AsyncIterator[StreamChunk]:
        """Emit tool-input-available events using CUSTOM event type."""
        for client_tool in client_requests:
            chunk: CustomEvent = {
                "type": "CUSTOM",
                "timestamp": int(time.time() * 1000),
                "model": finish_event.get("model"),
                "name": "tool-input-available",
                "data": {
                    "toolCallId": client_tool.tool_call_id,
                    "toolName": client_tool.tool_name,
                    "input": client_tool.input,
                },
            }
            yield chunk

    async def _emit_tool_results(
        self,
        results: List[ToolResult],
        finish_event: RunFinishedEvent,
    ) -> AsyncIterator[StreamChunk]:
        """Emit TOOL_CALL_END events and add to messages."""
        for result in results:
            content = json.dumps(result.result)

            chunk: ToolCallEndEvent = {
                "type": "TOOL_CALL_END",
                "timestamp": int(time.time() * 1000),
                "model": finish_event.get("model"),
                "toolCallId": result.tool_call_id,
                "toolName": result.tool_name,
                "result": content,
            }
            yield chunk

            # Add tool result message
            tool_message: ModelMessage = {
                "role": "tool",
                "content": content,
                "toolCallId": result.tool_call_id,
            }
            self.messages.append(tool_message)

    def _get_pending_tool_calls_from_messages(self) -> List[ToolCall]:
        """Get tool calls that don't have results yet."""
        completed_tool_ids = set(
            msg.get("toolCallId")
            for msg in self.messages
            if msg.get("role") == "tool" and msg.get("toolCallId")
        )

        pending: List[ToolCall] = []
        for message in self.messages:
            if message.get("role") == "assistant" and message.get("toolCalls"):
                for tool_call in message["toolCalls"]:
                    if tool_call["id"] not in completed_tool_ids:
                        pending.append(tool_call)

        return pending

    def _create_synthetic_finished_event(self) -> RunFinishedEvent:
        """Create a synthetic RUN_FINISHED event for pending tool calls."""
        return {
            "type": "RUN_FINISHED",
            "runId": self._create_id("pending"),
            "model": self.options.model,
            "timestamp": int(time.time() * 1000),
            "finishReason": "tool_calls",
        }

    def _should_continue(self) -> bool:
        """Check if the loop should continue."""
        if self.cycle_phase == CyclePhase.EXECUTE_TOOL_CALLS:
            return True

        return self.loop_strategy(
            {
                "iterationCount": self.iteration_count,
                "messages": self.messages,
                "finishReason": self.last_finish_reason,
            }
        ) and self.tool_phase == ToolPhaseResult.CONTINUE

    def _set_tool_phase(self, phase: ToolPhaseResult) -> None:
        """Set the tool phase."""
        self.tool_phase = phase
        if phase == ToolPhaseResult.WAIT:
            self.should_emit_stream_end = False

    def _create_id(self, prefix: str) -> str:
        """Create a unique ID with a prefix."""
        import random
        import string

        timestamp = int(time.time() * 1000)
        random_suffix = "".join(
            random.choices(string.ascii_lowercase + string.digits, k=7)
        )
        return f"{prefix}-{timestamp}-{random_suffix}"


# ============================================================================
# Main chat function
# ============================================================================


async def chat(
    adapter: BaseAdapter,
    model: str,
    messages: List[ModelMessage],
    tools: Optional[List[Tool]] = None,
    system_prompts: Optional[List[str]] = None,
    agent_loop_strategy: Optional[AgentLoopStrategy] = None,
    options: Optional[Dict[str, Any]] = None,
    provider_options: Optional[Dict[str, Any]] = None,
) -> AsyncIterator[StreamChunk]:
    """
    Standalone chat streaming function with automatic tool execution loop.

    Args:
        adapter: AI adapter instance to use
        model: Model name (must be supported by the adapter)
        messages: Conversation messages
        tools: Optional tools for function calling (auto-executed)
        system_prompts: Optional system prompts to prepend
        agent_loop_strategy: Optional strategy for controlling tool execution loop
        options: Common options (temperature, max_tokens, etc.)
        provider_options: Provider-specific options

    Yields:
        StreamChunk objects representing different events during the conversation

    Example:
        >>> async for chunk in chat(
        ...     adapter=anthropic_adapter,
        ...     model="claude-3-5-sonnet-20241022",
        ...     messages=[{"role": "user", "content": "Hello!"}],
        ...     tools=[weather_tool],
        ... ):
        ...     if chunk["type"] == "content":
        ...         print(chunk["delta"], end="", flush=True)
    """
    chat_options = ChatOptions(
        model=model,
        messages=messages,
        tools=tools,
        system_prompts=system_prompts,
        agent_loop_strategy=agent_loop_strategy,
        options=options,
        provider_options=provider_options,
    )

    engine = ChatEngine(adapter, chat_options)

    async for chunk in engine.chat():
        yield chunk
