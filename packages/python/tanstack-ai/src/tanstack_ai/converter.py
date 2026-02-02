"""
TanStack AI Stream Chunk Converter

Converts streaming events from various AI providers (Anthropic, OpenAI) 
into TanStack AI AG-UI StreamChunk format.

Implements the AG-UI (Agent-User Interaction) Protocol event types:
- RUN_STARTED, RUN_FINISHED, RUN_ERROR (lifecycle events)
- TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END (text streaming)
- TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END (tool calling)
- STEP_STARTED, STEP_FINISHED (thinking/reasoning)
"""
import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime


class StreamChunkConverter:
    """
    Converts provider-specific streaming events to TanStack AI AG-UI StreamChunk format.
    
    Supports:
    - Anthropic streaming events
    - OpenAI streaming events
    """
    
    def __init__(self, model: str, provider: str = "anthropic"):
        """
        Initialize converter.
        
        Args:
            model: Model name (e.g., "claude-3-haiku-20240307", "gpt-4o")
            provider: Provider type ("anthropic" or "openai")
        """
        self.model = model
        self.provider = provider.lower()
        self.timestamp = int(datetime.now().timestamp() * 1000)
        self.accumulated_content = ""
        self.accumulated_thinking = ""
        self.tool_calls_map: Dict[int, Dict[str, Any]] = {}
        self.current_tool_index = -1
        self.run_finished = False
        
        # AG-UI lifecycle tracking
        self.run_id = self.generate_id()
        self.message_id = self.generate_id()
        self.step_id: Optional[str] = None
        self.has_emitted_run_started = False
        self.has_emitted_text_message_start = False
    
    def generate_id(self) -> str:
        """Generate a unique ID for the chunk"""
        return f"chatcmpl-{uuid.uuid4().hex[:8]}"
    
    def _get_event_type(self, event: Any) -> str:
        """Get event type from either dict or object"""
        if isinstance(event, dict):
            return event.get("type", "")
        return getattr(event, "type", "")
    
    def _get_attr(self, obj: Any, attr: str, default: Any = None) -> Any:
        """Get attribute from either dict or object"""
        if isinstance(obj, dict):
            return obj.get(attr, default)
        return getattr(obj, attr, default)
    
    def _maybe_emit_run_started(self) -> Optional[Dict[str, Any]]:
        """Create RUN_STARTED event if not already emitted"""
        if not self.has_emitted_run_started:
            self.has_emitted_run_started = True
            return {
                "type": "RUN_STARTED",
                "runId": self.run_id,
                "model": self.model,
                "timestamp": self.timestamp
            }
        return None
    
    def _maybe_emit_text_message_start(self) -> Optional[Dict[str, Any]]:
        """Create TEXT_MESSAGE_START event if not already emitted"""
        if not self.has_emitted_text_message_start:
            self.has_emitted_text_message_start = True
            return {
                "type": "TEXT_MESSAGE_START",
                "messageId": self.message_id,
                "model": self.model,
                "timestamp": self.timestamp,
                "role": "assistant"
            }
        return None
    
    async def convert_anthropic_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert Anthropic streaming event to AG-UI StreamChunk format"""
        chunks = []
        event_type = self._get_event_type(event)
        
        # Emit RUN_STARTED on first event
        run_started = self._maybe_emit_run_started()
        if run_started:
            chunks.append(run_started)
        
        if event_type == "content_block_start":
            content_block = self._get_attr(event, "content_block")
            if content_block:
                block_type = self._get_attr(content_block, "type")
                
                if block_type == "tool_use":
                    # Tool call is starting
                    self.current_tool_index += 1
                    tool_id = self._get_attr(content_block, "id")
                    tool_name = self._get_attr(content_block, "name")
                    
                    self.tool_calls_map[self.current_tool_index] = {
                        "id": tool_id,
                        "name": tool_name,
                        "input": "",
                        "started": False
                    }
                elif block_type == "thinking":
                    # Thinking/reasoning block starting
                    self.accumulated_thinking = ""
                    self.step_id = self.generate_id()
                    chunks.append({
                        "type": "STEP_STARTED",
                        "stepId": self.step_id,
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "stepType": "thinking"
                    })
        
        elif event_type == "content_block_delta":
            delta = self._get_attr(event, "delta")
            
            if delta and self._get_attr(delta, "type") == "text_delta":
                # Emit TEXT_MESSAGE_START on first text content
                text_start = self._maybe_emit_text_message_start()
                if text_start:
                    chunks.append(text_start)
                
                # Text content delta
                delta_text = self._get_attr(delta, "text", "")
                self.accumulated_content += delta_text
                
                chunks.append({
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": self.message_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "delta": delta_text,
                    "content": self.accumulated_content
                })
            
            elif delta and self._get_attr(delta, "type") == "thinking_delta":
                # Thinking content delta
                delta_thinking = self._get_attr(delta, "thinking", "")
                self.accumulated_thinking += delta_thinking
                
                chunks.append({
                    "type": "STEP_FINISHED",
                    "stepId": self.step_id or self.generate_id(),
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "delta": delta_thinking,
                    "content": self.accumulated_thinking
                })
            
            elif delta and self._get_attr(delta, "type") == "input_json_delta":
                # Tool input is being streamed
                partial_json = self._get_attr(delta, "partial_json", "")
                tool_call = self.tool_calls_map.get(self.current_tool_index)
                
                if tool_call:
                    # Emit TOOL_CALL_START on first args delta
                    if not tool_call["started"]:
                        tool_call["started"] = True
                        chunks.append({
                            "type": "TOOL_CALL_START",
                            "toolCallId": tool_call["id"],
                            "toolName": tool_call["name"],
                            "model": self.model,
                            "timestamp": self.timestamp,
                            "index": self.current_tool_index
                        })
                    
                    tool_call["input"] += partial_json
                    
                    chunks.append({
                        "type": "TOOL_CALL_ARGS",
                        "toolCallId": tool_call["id"],
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "delta": partial_json,
                        "args": tool_call["input"]
                    })
        
        elif event_type == "content_block_stop":
            # Content block completed
            tool_call = self.tool_calls_map.get(self.current_tool_index)
            if tool_call:
                # If tool call wasn't started yet (no args), start it now
                if not tool_call["started"]:
                    tool_call["started"] = True
                    chunks.append({
                        "type": "TOOL_CALL_START",
                        "toolCallId": tool_call["id"],
                        "toolName": tool_call["name"],
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "index": self.current_tool_index
                    })
                
                # Parse input and emit TOOL_CALL_END
                parsed_input = {}
                if tool_call["input"]:
                    try:
                        parsed_input = json.loads(tool_call["input"])
                    except json.JSONDecodeError:
                        parsed_input = {}
                
                chunks.append({
                    "type": "TOOL_CALL_END",
                    "toolCallId": tool_call["id"],
                    "toolName": tool_call["name"],
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "input": parsed_input
                })
            
            # Emit TEXT_MESSAGE_END if we had text content
            if self.has_emitted_text_message_start and self.accumulated_content:
                chunks.append({
                    "type": "TEXT_MESSAGE_END",
                    "messageId": self.message_id,
                    "model": self.model,
                    "timestamp": self.timestamp
                })
        
        elif event_type == "message_delta":
            # Message metadata update (includes stop_reason and usage)
            delta = self._get_attr(event, "delta")
            usage = self._get_attr(event, "usage")
            
            stop_reason = self._get_attr(delta, "stop_reason") if delta else None
            if stop_reason:
                usage_dict = None
                if usage:
                    usage_dict = {
                        "promptTokens": self._get_attr(usage, "input_tokens", 0),
                        "completionTokens": self._get_attr(usage, "output_tokens", 0),
                        "totalTokens": self._get_attr(usage, "input_tokens", 0) + self._get_attr(usage, "output_tokens", 0)
                    }
                
                # Handle max_tokens as error
                if stop_reason == "max_tokens":
                    self.run_finished = True
                    chunks.append({
                        "type": "RUN_ERROR",
                        "runId": self.run_id,
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "error": {
                            "message": "The response was cut off because the maximum token limit was reached.",
                            "code": "max_tokens"
                        }
                    })
                else:
                    # Map Anthropic stop_reason to TanStack format
                    finish_reason = {
                        "tool_use": "tool_calls",
                        "end_turn": "stop"
                    }.get(stop_reason, stop_reason)
                    
                    self.run_finished = True
                    chunks.append({
                        "type": "RUN_FINISHED",
                        "runId": self.run_id,
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "finishReason": finish_reason,
                        "usage": usage_dict
                    })
        
        elif event_type == "message_stop":
            # Stream completed - this is a fallback if message_delta didn't emit RUN_FINISHED
            if not self.run_finished:
                self.run_finished = True
                chunks.append({
                    "type": "RUN_FINISHED",
                    "runId": self.run_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "finishReason": "stop"
                })
        
        return chunks
    
    async def convert_openai_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert OpenAI streaming event to AG-UI StreamChunk format"""
        chunks = []
        
        # Emit RUN_STARTED on first event
        run_started = self._maybe_emit_run_started()
        if run_started:
            chunks.append(run_started)
        
        # OpenAI events have chunk.choices[0].delta structure
        choice = self._get_attr(event, "choices", [])
        if choice and len(choice) > 0:
            choice = choice[0]
        else:
            # Try direct access
            choice = event
        
        delta = self._get_attr(choice, "delta")
        
        # Handle content delta
        if delta:
            content = self._get_attr(delta, "content")
            if content:
                # Emit TEXT_MESSAGE_START on first text content
                text_start = self._maybe_emit_text_message_start()
                if text_start:
                    chunks.append(text_start)
                
                self.accumulated_content += content
                chunks.append({
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": self.message_id,
                    "model": self._get_attr(event, "model", self.model),
                    "timestamp": self.timestamp,
                    "delta": content,
                    "content": self.accumulated_content
                })
            
            # Handle tool calls
            tool_calls = self._get_attr(delta, "tool_calls")
            if tool_calls:
                for tool_call in tool_calls:
                    tool_index = self._get_attr(tool_call, "index", len(self.tool_calls_map))
                    tool_id = self._get_attr(tool_call, "id")
                    function = self._get_attr(tool_call, "function", {})
                    tool_name = self._get_attr(function, "name", "")
                    arguments = self._get_attr(function, "arguments", "")
                    
                    # Initialize tool call tracking if new
                    if tool_index not in self.tool_calls_map:
                        self.tool_calls_map[tool_index] = {
                            "id": tool_id or f"call_{self.timestamp}_{tool_index}",
                            "name": tool_name,
                            "input": "",
                            "started": False
                        }
                    
                    tracked = self.tool_calls_map[tool_index]
                    
                    # Update tool ID and name if provided
                    if tool_id:
                        tracked["id"] = tool_id
                    if tool_name:
                        tracked["name"] = tool_name
                    
                    # Emit TOOL_CALL_START on first encounter
                    if not tracked["started"] and (tool_id or tool_name):
                        tracked["started"] = True
                        chunks.append({
                            "type": "TOOL_CALL_START",
                            "toolCallId": tracked["id"],
                            "toolName": tracked["name"],
                            "model": self._get_attr(event, "model", self.model),
                            "timestamp": self.timestamp,
                            "index": tool_index
                        })
                    
                    # Accumulate arguments
                    if arguments:
                        tracked["input"] += arguments
                        chunks.append({
                            "type": "TOOL_CALL_ARGS",
                            "toolCallId": tracked["id"],
                            "model": self._get_attr(event, "model", self.model),
                            "timestamp": self.timestamp,
                            "delta": arguments,
                            "args": tracked["input"]
                        })
        
        # Handle completion
        finish_reason = self._get_attr(choice, "finish_reason")
        if finish_reason:
            # Emit TOOL_CALL_END for all pending tool calls
            for tool_index, tool_call in self.tool_calls_map.items():
                if tool_call["started"]:
                    parsed_input = {}
                    if tool_call["input"]:
                        try:
                            parsed_input = json.loads(tool_call["input"])
                        except json.JSONDecodeError:
                            parsed_input = {}
                    
                    chunks.append({
                        "type": "TOOL_CALL_END",
                        "toolCallId": tool_call["id"],
                        "toolName": tool_call["name"],
                        "model": self._get_attr(event, "model", self.model),
                        "timestamp": self.timestamp,
                        "input": parsed_input
                    })
            
            # Emit TEXT_MESSAGE_END if we had text content
            if self.has_emitted_text_message_start:
                chunks.append({
                    "type": "TEXT_MESSAGE_END",
                    "messageId": self.message_id,
                    "model": self._get_attr(event, "model", self.model),
                    "timestamp": self.timestamp
                })
            
            usage = self._get_attr(event, "usage")
            usage_dict = None
            if usage:
                usage_dict = {
                    "promptTokens": self._get_attr(usage, "prompt_tokens", 0),
                    "completionTokens": self._get_attr(usage, "completion_tokens", 0),
                    "totalTokens": self._get_attr(usage, "total_tokens", 0)
                }
            
            # Map OpenAI finish reasons
            mapped_finish_reason = {
                "stop": "stop",
                "length": "length",
                "tool_calls": "tool_calls",
                "content_filter": "content_filter"
            }.get(finish_reason, finish_reason)
            
            self.run_finished = True
            chunks.append({
                "type": "RUN_FINISHED",
                "runId": self.run_id,
                "model": self._get_attr(event, "model", self.model),
                "timestamp": self.timestamp,
                "finishReason": mapped_finish_reason,
                "usage": usage_dict
            })
        
        return chunks
    
    async def convert_event(self, event: Any) -> List[Dict[str, Any]]:
        """
        Convert provider streaming event to AG-UI StreamChunk format.
        Automatically detects provider based on event structure.
        """
        if self.provider == "anthropic":
            return await self.convert_anthropic_event(event)
        elif self.provider == "openai":
            return await self.convert_openai_event(event)
        else:
            # Try to auto-detect based on event structure
            event_type = self._get_event_type(event)
            
            # Anthropic events have types like "content_block_start", "message_delta"
            # OpenAI events have chunk.choices structure
            if event_type in ["content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"]:
                return await self.convert_anthropic_event(event)
            elif self._get_attr(event, "choices") is not None:
                return await self.convert_openai_event(event)
            else:
                # Default to Anthropic format
                return await self.convert_anthropic_event(event)
    
    async def convert_error(self, error: Exception) -> List[Dict[str, Any]]:
        """Convert an error to RUN_ERROR StreamChunk format (AG-UI Protocol)"""
        # Ensure RUN_STARTED was emitted before error
        chunks = []
        run_started = self._maybe_emit_run_started()
        if run_started:
            chunks.append(run_started)
        
        chunks.append({
            "type": "RUN_ERROR",
            "runId": self.run_id,
            "model": self.model,
            "timestamp": self.timestamp,
            "error": {
                "message": str(error),
                "code": getattr(error, "code", None) or type(error).__name__
            }
        })
        
        return chunks

