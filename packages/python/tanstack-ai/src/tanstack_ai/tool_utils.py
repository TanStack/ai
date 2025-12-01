"""
Tool utilities for defining and working with tools.

Provides helper functions for creating tools with type safety and validation.
"""

from typing import Any, Callable, Dict, Optional

from .types import Tool


def tool(
    name: str,
    description: str,
    input_schema: Optional[Dict[str, Any]] = None,
    output_schema: Optional[Dict[str, Any]] = None,
    execute: Optional[Callable[[Dict[str, Any]], Any]] = None,
    needs_approval: bool = False,
    metadata: Optional[Dict[str, Any]] = None,
) -> Tool:
    """
    Helper to define a tool with enforced type safety.

    Args:
        name: Unique name of the tool
        description: Clear description of what the tool does
        input_schema: JSON Schema describing the tool's input parameters
        output_schema: Optional JSON Schema for validating tool output
        execute: Optional function to execute when the model calls this tool
        needs_approval: If true, tool execution requires user approval
        metadata: Additional metadata for adapters or custom extensions

    Returns:
        Tool object

    Example:
        >>> get_weather = tool(
        ...     name="get_weather",
        ...     description="Get the current weather for a location",
        ...     input_schema={
        ...         "type": "object",
        ...         "properties": {
        ...             "location": {
        ...                 "type": "string",
        ...                 "description": "The city and state, e.g. San Francisco, CA",
        ...             },
        ...             "unit": {
        ...                 "type": "string",
        ...                 "enum": ["celsius", "fahrenheit"],
        ...             },
        ...         },
        ...         "required": ["location"],
        ...     },
        ...     execute=lambda args: fetch_weather(args["location"], args.get("unit")),
        ... )
    """
    return Tool(
        name=name,
        description=description,
        input_schema=input_schema,
        output_schema=output_schema,
        execute=execute,
        needs_approval=needs_approval,
        metadata=metadata or {},
    )
