"""
TanStack AI Stream Chunk Converter

Converts streaming events from various AI providers (Anthropic, OpenAI) 
into TanStack AI StreamChunk format.
"""
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime


class StreamChunkConverter:
    """
    Converts provider-specific streaming events to TanStack AI StreamChunk format.
    
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
    
    async def convert_anthropic_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert Anthropic streaming event to StreamChunk format"""
        chunks = []
        event_type = self._get_event_type(event)
        
        if event_type == "content_block_start":
            # Tool call is starting
            content_block = self._get_attr(event, "content_block")
            if content_block and self._get_attr(content_block, "type") == "tool_use":
                self.current_tool_index += 1
                self.tool_calls_map[self.current_tool_index] = {
                    "id": self._get_attr(content_block, "id"),
                    "name": self._get_attr(content_block, "name"),
                    "input": ""
                }
        
        elif event_type == "content_block_delta":
            delta = self._get_attr(event, "delta")
            
            if delta and self._get_attr(delta, "type") == "text_delta":
                # Text content delta
                delta_text = self._get_attr(delta, "text", "")
                self.accumulated_content += delta_text
                
                chunks.append({
                    "type": "content",
                    "id": self.generate_id(),
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "delta": delta_text,
                    "content": self.accumulated_content,
                    "role": "assistant"
                })
            
            elif delta and self._get_attr(delta, "type") == "input_json_delta":
                # Tool input is being streamed
                partial_json = self._get_attr(delta, "partial_json", "")
                tool_call = self.tool_calls_map.get(self.current_tool_index)
                
                if tool_call:
                    tool_call["input"] += partial_json
                    
                    chunks.append({
                        "type": "tool_call",
                        "id": self.generate_id(),
                        "model": self.model,
                        "timestamp": self.timestamp,
                        "toolCall": {
                            "id": tool_call["id"],
                            "type": "function",
                            "function": {
                                "name": tool_call["name"],
                                "arguments": partial_json  # Incremental JSON
                            }
                        },
                        "index": self.current_tool_index
                    })
        
        elif event_type == "message_delta":
            # Message metadata update (includes stop_reason and usage)
            delta = self._get_attr(event, "delta")
            usage = self._get_attr(event, "usage")
            
            stop_reason = self._get_attr(delta, "stop_reason") if delta else None
            if stop_reason:
                # Map Anthropic stop_reason to TanStack format
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
                    "type": "done",
                    "id": self.generate_id(),
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
                    "type": "done",
                    "id": self.generate_id(),
                    "model": self.model,
                    "timestamp": self.timestamp,
                    "finishReason": "stop"
                })
        
        return chunks
    
    async def convert_openai_event(self, event: Any) -> List[Dict[str, Any]]:
        """Convert OpenAI streaming event to StreamChunk format"""
        chunks = []
        
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
                self.accumulated_content += content
                chunks.append({
                    "type": "content",
                    "id": self._get_attr(event, "id", self.generate_id()),
                    "model": self._get_attr(event, "model", self.model),
                    "timestamp": self.timestamp,
                    "delta": content,
                    "content": self.accumulated_content,
                    "role": "assistant"
                })
            
            # Handle tool calls
            tool_calls = self._get_attr(delta, "tool_calls")
            if tool_calls:
                for tool_call in tool_calls:
                    chunks.append({
                        "type": "tool_call",
                        "id": self._get_attr(event, "id", self.generate_id()),
                        "model": self._get_attr(event, "model", self.model),
                        "timestamp": self.timestamp,
                        "toolCall": {
                            "id": self._get_attr(tool_call, "id", f"call_{self.timestamp}"),
                            "type": "function",
                            "function": {
                                "name": self._get_attr(self._get_attr(tool_call, "function", {}), "name", ""),
                                "arguments": self._get_attr(self._get_attr(tool_call, "function", {}), "arguments", "")
                            }
                        },
                        "index": self._get_attr(tool_call, "index", 0)
                    })
        
        # Handle completion
        finish_reason = self._get_attr(choice, "finish_reason")
        if finish_reason:
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
                "type": "done",
                "id": self._get_attr(event, "id", self.generate_id()),
                "model": self._get_attr(event, "model", self.model),
                "timestamp": self.timestamp,
                "finishReason": finish_reason,
                "usage": usage_dict
            })
        
        return chunks
    
    async def convert_event(self, event: Any) -> List[Dict[str, Any]]:
        """
        Convert provider streaming event to StreamChunk format.
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
        """Convert an error to ErrorStreamChunk format"""
        return {
            "type": "error",
            "id": self.generate_id(),
            "model": self.model,
            "timestamp": self.timestamp,
            "error": {
                "message": str(error),
                "code": getattr(error, "code", None)
            }
        }

