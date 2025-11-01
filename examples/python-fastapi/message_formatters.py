"""
Message formatting utilities for converting between TanStack AI and provider formats.
"""
import json
from typing import List, Dict, Any, Tuple, Optional, Union


def format_messages_for_anthropic(messages: Union[List[Dict[str, Any]], List[Any]]) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Convert TanStack AI message format to Anthropic format.
    Separates system messages and formats tool messages.
    
    Args:
        messages: List of TanStack AI messages (dicts or Pydantic models)
        
    Returns:
        Tuple of (system_message, formatted_messages)
    """
    # Convert Pydantic models to dicts if needed
    message_dicts = []
    for msg in messages:
        if hasattr(msg, 'dict'):
            message_dicts.append(msg.dict())
        elif isinstance(msg, dict):
            message_dicts.append(msg)
        else:
            # Try to convert to dict via attributes
            message_dicts.append({
                "role": getattr(msg, "role", "user"),
                "content": getattr(msg, "content", None),
                "name": getattr(msg, "name", None),
                "toolCalls": getattr(msg, "toolCalls", None),
                "toolCallId": getattr(msg, "toolCallId", None),
            })
    
    system_messages = [m for m in message_dicts if m.get("role") == "system"]
    non_system_messages = [m for m in message_dicts if m.get("role") != "system"]
    
    # Anthropic API expects system to be a string (not a list)
    # Multiple system messages are joined with newlines
    # Only set system_message if there's actual content (not empty)
    system_message = None
    if system_messages:
        system_content = "\n".join([m.get("content") or "" for m in system_messages if m.get("content")])
        if system_content.strip():  # Only set if not empty after stripping whitespace
            system_message = system_content
    
    formatted_messages = []
    for msg in non_system_messages:
        role = msg.get("role")
        content = msg.get("content")
        tool_calls = msg.get("toolCalls")
        tool_call_id = msg.get("toolCallId")
        
        if role == "tool" and tool_call_id:
            # Tool result message
            formatted_messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_call_id,
                    "content": content or ""
                }]
            })
        elif role == "assistant" and tool_calls:
            # Assistant message with tool calls
            content_list = []
            if content:
                content_list.append({"type": "text", "text": content})
            
            for tool_call in tool_calls:
                content_list.append({
                    "type": "tool_use",
                    "id": tool_call["id"],
                    "name": tool_call["function"]["name"],
                    "input": json.loads(tool_call["function"]["arguments"])
                })
            
            formatted_messages.append({
                "role": "assistant",
                "content": content_list
            })
        else:
            # Regular message
            formatted_messages.append({
                "role": role if role in ["assistant", "user"] else "user",
                "content": content or ""
            })
    
    return system_message, formatted_messages


def format_messages_for_openai(messages: Union[List[Dict[str, Any]], List[Any]]) -> List[Dict[str, Any]]:
    """
    Convert TanStack AI message format to OpenAI format.
    
    Args:
        messages: List of TanStack AI messages (dicts or Pydantic models)
        
    Returns:
        List of OpenAI-formatted messages
    """
    # Convert Pydantic models to dicts if needed
    message_dicts = []
    for msg in messages:
        if hasattr(msg, 'dict'):
            message_dicts.append(msg.dict())
        elif isinstance(msg, dict):
            message_dicts.append(msg)
        else:
            # Try to convert to dict via attributes
            message_dicts.append({
                "role": getattr(msg, "role", "user"),
                "content": getattr(msg, "content", None),
                "name": getattr(msg, "name", None),
                "toolCalls": getattr(msg, "toolCalls", None),
                "toolCallId": getattr(msg, "toolCallId", None),
            })
    
    formatted_messages = []
    
    for msg in message_dicts:
        role = msg.get("role")
        content = msg.get("content")
        tool_calls = msg.get("toolCalls")
        tool_call_id = msg.get("toolCallId")
        name = msg.get("name")
        
        if role == "tool" and tool_call_id:
            formatted_messages.append({
                "role": "tool",
                "content": content or "",
                "tool_call_id": tool_call_id
            })
        elif role == "assistant" and tool_calls:
            formatted_messages.append({
                "role": "assistant",
                "content": content,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": tc["type"],
                        "function": tc["function"]
                    }
                    for tc in tool_calls
                ]
            })
        else:
            formatted_msg = {
                "role": role if role in ["system", "user", "assistant"] else "user",
                "content": content or ""
            }
            if name:
                formatted_msg["name"] = name
            formatted_messages.append(formatted_msg)
    
    return formatted_messages

