"""
TanStack AI Stream Chunk Converter

Converts streaming events from various AI providers (Anthropic, OpenAI) 
into TanStack AI AG-UI event format.
"""
import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime


class StreamChunkConverter:
    """
    Converts provider-specific streaming events to TanStack AI AG-UI event format.
    
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
        self.tool_calls_map: Dict[int, Dict[str, Any]] = {}
        self.current_tool_index = -1
        self.done_emitted = False
        
        # AG-UI lifecycle tracking
        self.run_id = self.generate_id()
        self.message_id = self.generate_id()
        self.run_started_emitted = False
        self.text_message_started = False
    
    def generate_id(self) -> str:
        """Generate a unique ID for the event"""
        return f"evt-{uuid.uuid4().hex[:8]}"
    
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
    
    def _safe_json_parse(self, json_str: str) -> Any:
        """Safely parse JSON string"""
        try:
            return json.loads(json_str)
        except:
            return json_str
    
    async def convert_anthropic_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert Anthropic streaming event to AG-UI event format"""
        chunks = []
        event_type = self._get_event_type(event)
        
        # Emit RUN_STARTED on first event
        if not self.run_started_emitted:
            self.run_started_emitted = True
            chunks.append({
                "type": "RUN_STARTED",
                "runId": self.run_id,
                "model": self.model,
                "timestamp": self.timestamp,
            })
        
        if event_type == "content_block_start":
            # Tool call is starting
            content_block = self._get_attr(event, "content_block")
            if content_block and self._get_attr(content_block, "type") == "tool_use":
                self.current_tool_index += 1
                tool_call_id = self._get_attr(content_block, "id")
                tool_name = self._get_attr(content_block, "name")
                self.tool_calls_map[self.current_tool_index] = {
                    "id": tool_call_id,
                    "name": tool_name,
                    "input": ""
                }
                # Emit TOOL_CALL_START
                chunks.append({
                    "type": "TOOL_CALL_START",
                    "toolCallId": tool_call_id,
                    "toolName": tool_name,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "index": self.current_tool_index,
                })
        
        elif event_type == "content_block_delta":
            delta = self._get_attr(event, "delta")
            
            if delta and self._get_attr(delta, "type") == "text_delta":
                # Emit TEXT_MESSAGE_START on first text
                if not self.text_message_started:
                    self.text_message_started = True
                    chunks.append({
                        "type": "TEXT_MESSAGE_START",
                        "messageId": self.message_id,
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "role": "assistant",
                    })
                
                # Text content delta
                delta_text = self._get_attr(delta, "text", "")
                self.accumulated_content += delta_text
                
                chunks.append({
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": self.message_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "delta": delta_text,
                    "content": self.accumulated_content,
                })
            
            elif delta and self._get_attr(delta, "type") == "input_json_delta":
                # Tool input is being streamed
                partial_json = self._get_attr(delta, "partial_json", "")
                tool_call = self.tool_calls_map.get(self.current_tool_index)
                
                if tool_call:
                    tool_call["input"] += partial_json
                    
                    # Emit TOOL_CALL_ARGS
                    chunks.append({
                        "type": "TOOL_CALL_ARGS",
                        "toolCallId": tool_call["id"],
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "delta": partial_json,
                        "args": tool_call["input"],
                    })
        
        elif event_type == "content_block_stop":
            # Emit TEXT_MESSAGE_END if we had text content
            if self.text_message_started and self.accumulated_content:
                chunks.append({
                    "type": "TEXT_MESSAGE_END",
                    "messageId": self.message_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                })
            
            # Emit TOOL_CALL_END for tool calls
            tool_call = self.tool_calls_map.get(self.current_tool_index)
            if tool_call:
                chunks.append({
                    "type": "TOOL_CALL_END",
                    "toolCallId": tool_call["id"],
                    "toolName": tool_call["name"],
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "input": self._safe_json_parse(tool_call["input"] or "{}"),
                })
        
        elif event_type == "message_delta":
            # Message metadata update (includes stop_reason and usage)
            delta = self._get_attr(event, "delta")
            usage = self._get_attr(event, "usage")
            
            stop_reason = self._get_attr(delta, "stop_reason") if delta else None
            if stop_reason:
                # Map Anthropic stop_reason to AG-UI format
                if stop_reason == "tool_use":
                    finish_reason = "tool_calls"
                elif stop_reason == "end_turn":
                    finish_reason = "stop"
                else:
                    finish_reason = stop_reason
                
                usage_dict = None
                if usage:
                    usage_dict = {
                        "promptTokens": self._get_attr(usage, "input_tokens", 0),
                        "completionTokens": self._get_attr(usage, "output_tokens", 0),
                        "totalTokens": self._get_attr(usage, "input_tokens", 0) + self._get_attr(usage, "output_tokens", 0)
                    }
                
                self.done_emitted = True
                chunks.append({
                    "type": "RUN_FINISHED",
                    "runId": self.run_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "finishReason": finish_reason,
                    "usage": usage_dict
                })
        
        elif event_type == "message_stop":
            # Stream completed - this is a fallback if message_delta didn't emit done
            if not self.done_emitted:
                self.done_emitted = True
                chunks.append({
                    "type": "RUN_FINISHED",
                    "runId": self.run_id,
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "finishReason": "stop"
                })
        
        return chunks
    
    async def convert_openai_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert OpenAI streaming event to AG-UI event format"""
        chunks = []
        
        # Emit RUN_STARTED on first event
        if not self.run_started_emitted:
            self.run_started_emitted = True
            chunks.append({
                "type": "RUN_STARTED",
                "runId": self.run_id,
                "model": self.model,
                "timestamp": self.timestamp,
            })
        
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
                # Emit TEXT_MESSAGE_START on first text
                if not self.text_message_started:
                    self.text_message_started = True
                    chunks.append({
                        "type": "TEXT_MESSAGE_START",
                        "messageId": self.message_id,
                        "model": self._get_attr(event, "model", self.model),
                        "timestamp": self.timestamp,
                        "role": "assistant",
                    })
                
                self.accumulated_content += content
                chunks.append({
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": self.message_id,
                    "model": self._get_attr(event, "model", self.model),
                    "timestamp": self.timestamp,
                    "delta": content,
                    "content": self.accumulated_content,
                })
            
            # Handle tool calls
            tool_calls = self._get_attr(delta, "tool_calls")
            if tool_calls:
                for tool_call in tool_calls:
                    tool_call_id = self._get_attr(tool_call, "id", f"call_{self.timestamp}")
                    function = self._get_attr(tool_call, "function", {})
                    tool_name = self._get_attr(function, "name", "")
                    args = self._get_attr(function, "arguments", "")
                    index = self._get_attr(tool_call, "index", 0)
                    
                    # Emit TOOL_CALL_START
                    chunks.append({
                        "type": "TOOL_CALL_START",
                        "toolCallId": tool_call_id,
                        "toolName": tool_name,
                        "model": self._get_attr(event, "model", self.model),
                        "timestamp": self.timestamp,
                        "index": index,
                    })
                    
                    # Emit TOOL_CALL_ARGS if there are arguments
                    if args:
                        chunks.append({
                            "type": "TOOL_CALL_ARGS",
                            "toolCallId": tool_call_id,
                            "model": self._get_attr(event, "model", self.model),
                            "timestamp": self.timestamp,
                            "delta": args,
                            "args": args,
                        })
        
        # Handle completion
        finish_reason = self._get_attr(choice, "finish_reason")
        if finish_reason:
            # Emit TEXT_MESSAGE_END if we had text
            if self.text_message_started:
                chunks.append({
                    "type": "TEXT_MESSAGE_END",
                    "messageId": self.message_id,
                    "model": self._get_attr(event, "model", self.model),
                    "timestamp": self.timestamp,
                })
            
            usage = self._get_attr(event, "usage")
            usage_dict = None
            if usage:
                usage_dict = {
                    "promptTokens": self._get_attr(usage, "prompt_tokens", 0),
                    "completionTokens": self._get_attr(usage, "completion_tokens", 0),
                    "totalTokens": self._get_attr(usage, "total_tokens", 0)
                }
            
            self.done_emitted = True
            chunks.append({
                "type": "RUN_FINISHED",
                "runId": self.run_id,
                "model": self._get_attr(event, "model", self.model),
                "timestamp": self.timestamp,
                "finishReason": finish_reason,
                "usage": usage_dict
            })
        
        return chunks
    
    async def convert_event(self, event: Any) -> List[Dict[str, Any]]:
        """
        Convert provider streaming event to AG-UI event format.
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
            if event_type in ["content_block_start", "content_block_delta", "message_delta", "message_stop"]:
                return await self.convert_anthropic_event(event)
            elif self._get_attr(event, "choices") is not None:
                return await self.convert_openai_event(event)
            else:
                # Default to Anthropic format
                return await self.convert_anthropic_event(event)
    
    async def convert_error(self, error: Exception) -> Dict[str, Any]:
        """Convert an error to RUN_ERROR event format"""
        return {
            "type": "RUN_ERROR",
            "runId": self.run_id,
            "model": self.model,
            "timestamp": self.timestamp,
            "error": {
                "message": str(error),
                "code": getattr(error, "code", None)
            }
        }

