"""
Tool call management for the chat method's automatic tool execution loop.

Handles accumulation of streaming tool calls, validation, execution, and
approval workflows.
"""

import json
import time
from typing import Any, Dict, List, Optional, Tuple

from .types import (
    Tool,
    ToolCall,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
)


class ToolCallManager:
    """
    Manages tool call accumulation and execution for automatic tool execution loops.

    Responsibilities:
    - Accumulates streaming tool call events (ID, name, arguments)
    - Validates tool calls (filters out incomplete ones)
    - Executes tool `execute` functions with parsed arguments
    - Emits `TOOL_CALL_END` events for client visibility
    - Returns tool result messages for conversation history

    Example:
        >>> manager = ToolCallManager(tools)
        >>> # During streaming, accumulate tool calls
        >>> for chunk in stream:
        ...     if chunk["type"] == "TOOL_CALL_START":
        ...         manager.add_tool_call_start_event(chunk)
        ...     elif chunk["type"] == "TOOL_CALL_ARGS":
        ...         manager.add_tool_call_args_event(chunk)
        >>> # After stream completes, execute tools
        >>> if manager.has_tool_calls():
        ...     for chunk in manager.execute_tools(finish_event):
        ...         yield chunk
        ...     manager.clear()
    """

    def __init__(self, tools: List[Tool]):
        """
        Initialize the tool call manager.

        Args:
            tools: List of available tools
        """
        self.tools = tools
        self._tool_calls_map: Dict[int, ToolCall] = {}

    def add_tool_call_start_event(self, event: ToolCallStartEvent) -> None:
        """
        Add a TOOL_CALL_START event to begin tracking a tool call.

        Args:
            event: TOOL_CALL_START event
        """
        index = event.get("index", len(self._tool_calls_map))
        self._tool_calls_map[index] = {
            "id": event["toolCallId"],
            "type": "function",
            "function": {
                "name": event["toolName"],
                "arguments": "",
            },
        }

    def add_tool_call_args_event(self, event: ToolCallArgsEvent) -> None:
        """
        Add a TOOL_CALL_ARGS event to accumulate arguments.

        Args:
            event: TOOL_CALL_ARGS event
        """
        # Find the tool call by ID
        for tool_call in self._tool_calls_map.values():
            if tool_call["id"] == event["toolCallId"]:
                tool_call["function"]["arguments"] += event.get("delta", "")
                break

    def complete_tool_call(self, event: ToolCallEndEvent) -> None:
        """
        Complete a tool call with its final input.
        Called when TOOL_CALL_END is received.

        Args:
            event: TOOL_CALL_END event
        """
        for tool_call in self._tool_calls_map.values():
            if tool_call["id"] == event["toolCallId"]:
                if event.get("input") is not None:
                    tool_call["function"]["arguments"] = json.dumps(event["input"])
                break

    def has_tool_calls(self) -> bool:
        """Check if there are any complete tool calls to execute."""
        return len(self.get_tool_calls()) > 0

    def get_tool_calls(self) -> List[ToolCall]:
        """Get all complete tool calls (filtered for valid ID and name)."""
        return [
            tc
            for tc in self._tool_calls_map.values()
            if tc.get("id")
            and tc.get("function", {}).get("name")
            and tc["function"]["name"].strip()
        ]

    def clear(self) -> None:
        """Clear the tool calls map for the next iteration."""
        self._tool_calls_map.clear()


# ============================================================================
# Tool Execution
# ============================================================================


class ToolResult:
    """Result from tool execution."""

    def __init__(
        self,
        tool_call_id: str,
        tool_name: str,
        result: Any,
        state: Optional[str] = None,
    ):
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        self.result = result
        self.state = state  # 'output-available' | 'output-error'


class ApprovalRequest:
    """Request for user approval before tool execution."""

    def __init__(
        self,
        tool_call_id: str,
        tool_name: str,
        input_data: Any,
        approval_id: str,
    ):
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        self.input = input_data
        self.approval_id = approval_id


class ClientToolRequest:
    """Request for client-side tool execution."""

    def __init__(
        self,
        tool_call_id: str,
        tool_name: str,
        input_data: Any,
    ):
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        self.input = input_data


class ExecuteToolCallsResult:
    """Result from executing tool calls."""

    def __init__(
        self,
        results: List[ToolResult],
        needs_approval: List[ApprovalRequest],
        needs_client_execution: List[ClientToolRequest],
    ):
        self.results = results
        self.needs_approval = needs_approval
        self.needs_client_execution = needs_client_execution


async def execute_tool_calls(
    tool_calls: List[ToolCall],
    tools: List[Tool],
    approvals: Optional[Dict[str, bool]] = None,
    client_results: Optional[Dict[str, Any]] = None,
) -> ExecuteToolCallsResult:
    """
    Execute tool calls based on their configuration.

    Handles three cases:
    1. Client tools (no execute) - request client to execute
    2. Server tools with approval - check approval before executing
    3. Normal server tools - execute immediately

    Args:
        tool_calls: Tool calls from the LLM
        tools: Available tools with their configurations
        approvals: Map of approval decisions (approval.id -> approved boolean)
        client_results: Map of client-side execution results (toolCallId -> result)

    Returns:
        ExecuteToolCallsResult with results, approval requests, and client execution requests
    """
    if approvals is None:
        approvals = {}
    if client_results is None:
        client_results = {}

    results: List[ToolResult] = []
    needs_approval: List[ApprovalRequest] = []
    needs_client_execution: List[ClientToolRequest] = []

    # Create tool lookup map
    tool_map = {tool.name: tool for tool in tools}

    for tool_call in tool_calls:
        tool_name = tool_call["function"]["name"]
        tool = tool_map.get(tool_name)

        if not tool:
            # Unknown tool - return error
            results.append(
                ToolResult(
                    tool_call["id"],
                    tool_name,
                    {"error": f"Unknown tool: {tool_name}"},
                    "output-error",
                )
            )
            continue

        # Parse arguments
        args_str = tool_call["function"]["arguments"].strip() or "{}"
        try:
            input_data = json.loads(args_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse tool arguments as JSON: {args_str}") from e

        # TODO: Validate input against input_schema if provided
        # (Would require a JSON Schema validator library)

        # CASE 1: Client-side tool (no execute function)
        if not tool.execute:
            if tool.needs_approval:
                approval_id = f"approval_{tool_call['id']}"

                # Check if approval decision exists
                if approval_id in approvals:
                    approved = approvals[approval_id]

                    if approved:
                        # Approved - check if client has executed
                        if tool_call["id"] in client_results:
                            results.append(
                                ToolResult(
                                    tool_call["id"],
                                    tool_name,
                                    client_results[tool_call["id"]],
                                )
                            )
                        else:
                            # Approved but not executed yet - request client execution
                            needs_client_execution.append(
                                ClientToolRequest(
                                    tool_call["id"],
                                    tool_name,
                                    input_data,
                                )
                            )
                    else:
                        # User declined
                        results.append(
                            ToolResult(
                                tool_call["id"],
                                tool_name,
                                {"error": "User declined tool execution"},
                                "output-error",
                            )
                        )
                else:
                    # Need approval first
                    needs_approval.append(
                        ApprovalRequest(
                            tool_call["id"],
                            tool_name,
                            input_data,
                            approval_id,
                        )
                    )
            else:
                # No approval needed - check if client has executed
                if tool_call["id"] in client_results:
                    results.append(
                        ToolResult(
                            tool_call["id"],
                            tool_name,
                            client_results[tool_call["id"]],
                        )
                    )
                else:
                    # Request client execution
                    needs_client_execution.append(
                        ClientToolRequest(
                            tool_call["id"],
                            tool_name,
                            input_data,
                        )
                    )
            continue

        # CASE 2: Server tool with approval required
        if tool.needs_approval:
            approval_id = f"approval_{tool_call['id']}"

            # Check if approval decision exists
            if approval_id in approvals:
                approved = approvals[approval_id]

                if approved:
                    # Execute after approval
                    try:
                        result = await _execute_tool(tool, input_data)
                        results.append(ToolResult(tool_call["id"], tool_name, result))
                    except Exception as e:
                        results.append(
                            ToolResult(
                                tool_call["id"],
                                tool_name,
                                {"error": str(e)},
                                "output-error",
                            )
                        )
                else:
                    # User declined
                    results.append(
                        ToolResult(
                            tool_call["id"],
                            tool_name,
                            {"error": "User declined tool execution"},
                            "output-error",
                        )
                    )
            else:
                # Need approval
                needs_approval.append(
                    ApprovalRequest(
                        tool_call["id"],
                        tool_name,
                        input_data,
                        approval_id,
                    )
                )
            continue

        # CASE 3: Normal server tool - execute immediately
        try:
            result = await _execute_tool(tool, input_data)
            results.append(ToolResult(tool_call["id"], tool_name, result))
        except Exception as e:
            results.append(
                ToolResult(
                    tool_call["id"],
                    tool_name,
                    {"error": str(e)},
                    "output-error",
                )
            )

    return ExecuteToolCallsResult(results, needs_approval, needs_client_execution)


async def _execute_tool(tool: Tool, input_data: Dict[str, Any]) -> Any:
    """
    Execute a tool with the given input.

    Args:
        tool: Tool to execute
        input_data: Input arguments for the tool

    Returns:
        Result from tool execution
    """
    if not tool.execute:
        raise ValueError(f"Tool {tool.name} does not have an execute function")

    # Execute the tool
    result = tool.execute(input_data)

    # Handle async functions
    import asyncio
    import inspect

    if inspect.iscoroutine(result):
        result = await result

    # TODO: Validate output against output_schema if provided
    # (Would require a JSON Schema validator library)

    return result
