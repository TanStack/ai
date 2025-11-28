"""
Anthropic adapter for TanStack AI.

Provides integration with Anthropic's Claude models using their Messages API.
"""

import json
import time
from typing import Any, AsyncIterator, Dict, List, Optional

try:
    import anthropic
    from anthropic import Anthropic, AsyncAnthropic
    from anthropic.types import (
        ContentBlock,
        Message,
        MessageStreamEvent,
        TextBlock,
        ToolUseBlock,
    )

    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from .base_adapter import BaseAdapter
from .message_formatters import format_messages_for_anthropic
from .types import (
    AIAdapterConfig,
    ChatOptions,
    ContentStreamChunk,
    DoneStreamChunk,
    EmbeddingOptions,
    EmbeddingResult,
    ErrorStreamChunk,
    StreamChunk,
    SummarizationOptions,
    SummarizationResult,
    ThinkingStreamChunk,
    ToolCallStreamChunk,
)


class AnthropicAdapter(BaseAdapter):
    """
    Adapter for Anthropic's Claude models.

    Supports streaming chat completions with tool calling.
    """

    def __init__(self, config: AIAdapterConfig = AIAdapterConfig()):
        """
        Initialize the Anthropic adapter.

        Args:
            config: Configuration including API key

        Raises:
            ImportError: If anthropic package is not installed
        """
        if not ANTHROPIC_AVAILABLE:
            raise ImportError(
                "anthropic package is required. Install it with: pip install anthropic"
            )

        super().__init__(config)
        
        # Build client kwargs, only passing non-None values
        client_kwargs = {}
        if config.api_key:
            client_kwargs["api_key"] = config.api_key
        if config.base_url:
            client_kwargs["base_url"] = config.base_url
        if config.timeout is not None:
            client_kwargs["timeout"] = config.timeout
        if config.max_retries is not None:
            client_kwargs["max_retries"] = config.max_retries
        
        self.client = AsyncAnthropic(**client_kwargs)

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def models(self) -> List[str]:
        return [
            "claude-sonnet-4-5-20250929",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-sonnet-20240620",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
        ]

    async def chat_stream(self, options: ChatOptions) -> AsyncIterator[StreamChunk]:
        """
        Stream chat completions from Anthropic.

        Args:
            options: Chat options

        Yields:
            StreamChunk objects
        """
        try:
            # Format messages for Anthropic (function returns tuple of (system, messages))
            system_prompt, formatted_messages = format_messages_for_anthropic(
                options.messages
            )

            # Prepare request parameters
            request_params: Dict[str, Any] = {
                "model": options.model,
                "messages": formatted_messages,
                "max_tokens": options.options.get("max_tokens", 4096)
                if options.options
                else 4096,
            }

            # Add system prompt if present (either from formatter or options)
            if system_prompt:
                request_params["system"] = system_prompt
            elif options.system_prompts:
                # Merge system prompts from options
                request_params["system"] = "\n\n".join(options.system_prompts)

            # Add common options
            if options.options:
                if "temperature" in options.options:
                    request_params["temperature"] = options.options["temperature"]
                if "top_p" in options.options:
                    request_params["top_p"] = options.options["top_p"]
                if "top_k" in options.options:
                    request_params["top_k"] = options.options["top_k"]

            # Add tools if provided
            if options.tools:
                request_params["tools"] = self._format_tools(options.tools)

            # Add provider options
            if options.provider_options:
                request_params.update(options.provider_options)

            # Make the streaming request
            message_id = self._generate_id()
            accumulated_content = ""
            accumulated_thinking = ""
            tool_calls: Dict[int, Dict[str, Any]] = {}

            async with self.client.messages.stream(**request_params) as stream:
                async for event in stream:
                    timestamp = int(time.time() * 1000)

                    # Handle different event types
                    if event.type == "message_start":
                        # Message started - we could emit metadata here
                        pass

                    elif event.type == "content_block_start":
                        # New content block started
                        block = event.content_block
                        if hasattr(block, "type"):
                            if block.type == "text":
                                # Text content block
                                pass
                            elif block.type == "tool_use":
                                # Tool use block
                                tool_calls[event.index] = {
                                    "id": block.id,
                                    "type": "function",
                                    "function": {
                                        "name": block.name,
                                        "arguments": "",
                                    },
                                }

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if hasattr(delta, "type"):
                            if delta.type == "text_delta":
                                # Text content delta
                                accumulated_content += delta.text
                                yield ContentStreamChunk(
                                    type="content",
                                    id=message_id,
                                    model=options.model,
                                    timestamp=timestamp,
                                    delta=delta.text,
                                    content=accumulated_content,
                                    role="assistant",
                                )
                            elif delta.type == "input_json_delta":
                                # Tool input delta
                                if event.index in tool_calls:
                                    tool_calls[event.index]["function"][
                                        "arguments"
                                    ] += delta.partial_json

                    elif event.type == "content_block_stop":
                        # Content block completed
                        if event.index in tool_calls:
                            # Emit tool call chunk
                            tool_call = tool_calls[event.index]
                            yield ToolCallStreamChunk(
                                type="tool_call",
                                id=message_id,
                                model=options.model,
                                timestamp=timestamp,
                                toolCall=tool_call,
                                index=event.index,
                            )

                    elif event.type == "message_delta":
                        # Message metadata delta (finish reason, usage)
                        pass

                    elif event.type == "message_stop":
                        # Message completed - emit done chunk
                        final_message = await stream.get_final_message()
                        usage = None
                        if hasattr(final_message, "usage"):
                            usage = {
                                "promptTokens": final_message.usage.input_tokens,
                                "completionTokens": final_message.usage.output_tokens,
                                "totalTokens": final_message.usage.input_tokens
                                + final_message.usage.output_tokens,
                            }

                        # Determine finish reason
                        finish_reason = None
                        if hasattr(final_message, "stop_reason"):
                            if final_message.stop_reason == "end_turn":
                                finish_reason = "stop"
                            elif final_message.stop_reason == "max_tokens":
                                finish_reason = "length"
                            elif final_message.stop_reason == "tool_use":
                                finish_reason = "tool_calls"

                        yield DoneStreamChunk(
                            type="done",
                            id=message_id,
                            model=options.model,
                            timestamp=timestamp,
                            finishReason=finish_reason,
                            usage=usage,
                        )

        except Exception as e:
            # Emit error chunk
            yield ErrorStreamChunk(
                type="error",
                id=self._generate_id(),
                model=options.model,
                timestamp=int(time.time() * 1000),
                error={
                    "message": str(e),
                    "code": getattr(e, "code", None),
                },
            )

    def _format_tools(self, tools: List[Any]) -> List[Dict[str, Any]]:
        """
        Format tools for Anthropic API.

        Args:
            tools: List of Tool objects

        Returns:
            List of tool definitions in Anthropic format
        """
        formatted_tools = []
        for tool in tools:
            tool_def: Dict[str, Any] = {
                "name": tool.name,
                "description": tool.description,
            }
            if tool.input_schema:
                tool_def["input_schema"] = tool.input_schema
            formatted_tools.append(tool_def)
        return formatted_tools

    async def summarize(self, options: SummarizationOptions) -> SummarizationResult:
        """
        Summarize text using Anthropic models.

        Args:
            options: Summarization options

        Returns:
            SummarizationResult
        """
        # Build the prompt based on style
        style_prompts = {
            "bullet-points": "Summarize the following text as bullet points:",
            "paragraph": "Summarize the following text in a single paragraph:",
            "concise": "Provide a concise summary of the following text:",
        }

        style = options.style or "paragraph"
        prompt = style_prompts.get(style, style_prompts["paragraph"])

        if options.focus:
            prompt += f"\nFocus on: {', '.join(options.focus)}"

        prompt += f"\n\n{options.text}"

        # Make the request
        response = await self.client.messages.create(
            model=options.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=options.max_length or 1024,
        )

        # Extract summary from response
        summary = ""
        for block in response.content:
            if hasattr(block, "text"):
                summary += block.text

        return SummarizationResult(
            id=response.id,
            model=response.model,
            summary=summary.strip(),
            usage={
                "promptTokens": response.usage.input_tokens,
                "completionTokens": response.usage.output_tokens,
                "totalTokens": response.usage.input_tokens
                + response.usage.output_tokens,
            },
        )

    async def create_embeddings(self, options: EmbeddingOptions) -> EmbeddingResult:
        """
        Create embeddings (not supported by Anthropic).

        Args:
            options: Embedding options

        Raises:
            NotImplementedError: Anthropic doesn't support embeddings
        """
        raise NotImplementedError(
            "Anthropic does not support embeddings. Use OpenAI or another provider."
        )
