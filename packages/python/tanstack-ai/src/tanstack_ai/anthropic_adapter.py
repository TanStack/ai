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
    EmbeddingOptions,
    EmbeddingResult,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    StreamChunk,
    SummarizationOptions,
    SummarizationResult,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
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
        Stream chat completions from Anthropic using AG-UI Protocol events.

        Args:
            options: Chat options

        Yields:
            AG-UI StreamChunk events (RUN_STARTED, TEXT_MESSAGE_CONTENT, etc.)
        """
        # AG-UI lifecycle tracking
        run_id = self._generate_id()
        message_id = self._generate_id()
        step_id: Optional[str] = None
        has_emitted_run_started = False
        has_emitted_text_message_start = False
        
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
            accumulated_content = ""
            accumulated_thinking = ""
            tool_calls: Dict[int, Dict[str, Any]] = {}
            current_tool_index = -1

            async with self.client.messages.stream(**request_params) as stream:
                async for event in stream:
                    timestamp = int(time.time() * 1000)

                    # Emit RUN_STARTED on first event
                    if not has_emitted_run_started:
                        has_emitted_run_started = True
                        yield RunStartedEvent(
                            type="RUN_STARTED",
                            runId=run_id,
                            model=options.model,
                            timestamp=timestamp,
                            threadId=None,
                        )

                    # Handle different event types
                    if event.type == "message_start":
                        # Message started - metadata handled above
                        pass

                    elif event.type == "content_block_start":
                        # New content block started
                        block = event.content_block
                        if hasattr(block, "type"):
                            if block.type == "text":
                                # Text content block - will emit TEXT_MESSAGE_START on first delta
                                pass
                            elif block.type == "tool_use":
                                # Tool use block starting
                                current_tool_index += 1
                                tool_calls[current_tool_index] = {
                                    "id": block.id,
                                    "name": block.name,
                                    "input": "",
                                    "started": False,
                                }
                            elif block.type == "thinking":
                                # Thinking block starting
                                accumulated_thinking = ""
                                step_id = self._generate_id()
                                yield StepStartedEvent(
                                    type="STEP_STARTED",
                                    stepId=step_id,
                                    model=options.model,
                                    timestamp=timestamp,
                                    stepType="thinking",
                                )

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if hasattr(delta, "type"):
                            if delta.type == "text_delta":
                                # Emit TEXT_MESSAGE_START on first text content
                                if not has_emitted_text_message_start:
                                    has_emitted_text_message_start = True
                                    yield TextMessageStartEvent(
                                        type="TEXT_MESSAGE_START",
                                        messageId=message_id,
                                        model=options.model,
                                        timestamp=timestamp,
                                        role="assistant",
                                    )

                                # Text content delta
                                accumulated_content += delta.text
                                yield TextMessageContentEvent(
                                    type="TEXT_MESSAGE_CONTENT",
                                    messageId=message_id,
                                    model=options.model,
                                    timestamp=timestamp,
                                    delta=delta.text,
                                    content=accumulated_content,
                                )
                            elif delta.type == "thinking_delta":
                                # Thinking content delta
                                thinking_text = getattr(delta, "thinking", "")
                                accumulated_thinking += thinking_text
                                yield StepFinishedEvent(
                                    type="STEP_FINISHED",
                                    stepId=step_id or self._generate_id(),
                                    model=options.model,
                                    timestamp=timestamp,
                                    delta=thinking_text,
                                    content=accumulated_thinking,
                                )
                            elif delta.type == "input_json_delta":
                                # Tool input delta
                                if current_tool_index in tool_calls:
                                    tool_call = tool_calls[current_tool_index]
                                    
                                    # Emit TOOL_CALL_START on first args delta
                                    if not tool_call["started"]:
                                        tool_call["started"] = True
                                        yield ToolCallStartEvent(
                                            type="TOOL_CALL_START",
                                            toolCallId=tool_call["id"],
                                            toolName=tool_call["name"],
                                            model=options.model,
                                            timestamp=timestamp,
                                            index=current_tool_index,
                                        )

                                    tool_call["input"] += delta.partial_json
                                    yield ToolCallArgsEvent(
                                        type="TOOL_CALL_ARGS",
                                        toolCallId=tool_call["id"],
                                        model=options.model,
                                        timestamp=timestamp,
                                        delta=delta.partial_json,
                                        args=tool_call["input"],
                                    )

                    elif event.type == "content_block_stop":
                        # Content block completed
                        if current_tool_index in tool_calls:
                            tool_call = tool_calls[current_tool_index]
                            
                            # If tool call wasn't started yet (no args), start it now
                            if not tool_call["started"]:
                                tool_call["started"] = True
                                yield ToolCallStartEvent(
                                    type="TOOL_CALL_START",
                                    toolCallId=tool_call["id"],
                                    toolName=tool_call["name"],
                                    model=options.model,
                                    timestamp=timestamp,
                                    index=current_tool_index,
                                )

                            # Parse input and emit TOOL_CALL_END
                            parsed_input = {}
                            if tool_call["input"]:
                                try:
                                    parsed_input = json.loads(tool_call["input"])
                                except json.JSONDecodeError:
                                    parsed_input = {}

                            yield ToolCallEndEvent(
                                type="TOOL_CALL_END",
                                toolCallId=tool_call["id"],
                                toolName=tool_call["name"],
                                model=options.model,
                                timestamp=timestamp,
                                input=parsed_input,
                            )

                        # Emit TEXT_MESSAGE_END if we had text content
                        if has_emitted_text_message_start and accumulated_content:
                            yield TextMessageEndEvent(
                                type="TEXT_MESSAGE_END",
                                messageId=message_id,
                                model=options.model,
                                timestamp=timestamp,
                            )

                    elif event.type == "message_delta":
                        # Message metadata delta (finish reason, usage)
                        delta = event.delta
                        if hasattr(delta, "stop_reason") and delta.stop_reason:
                            usage = None
                            if hasattr(event, "usage") and event.usage:
                                usage = {
                                    "promptTokens": event.usage.input_tokens,
                                    "completionTokens": event.usage.output_tokens,
                                    "totalTokens": event.usage.input_tokens
                                    + event.usage.output_tokens,
                                }

                            # Map Anthropic stop_reason to TanStack format
                            if delta.stop_reason == "max_tokens":
                                yield RunErrorEvent(
                                    type="RUN_ERROR",
                                    runId=run_id,
                                    model=options.model,
                                    timestamp=timestamp,
                                    error={
                                        "message": "The response was cut off because the maximum token limit was reached.",
                                        "code": "max_tokens",
                                    },
                                )
                            else:
                                finish_reason = {
                                    "end_turn": "stop",
                                    "tool_use": "tool_calls",
                                }.get(delta.stop_reason, "stop")

                                yield RunFinishedEvent(
                                    type="RUN_FINISHED",
                                    runId=run_id,
                                    model=options.model,
                                    timestamp=timestamp,
                                    finishReason=finish_reason,
                                    usage=usage,
                                )

                    elif event.type == "message_stop":
                        # Message completed - emit RUN_FINISHED if not already done
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
                        finish_reason = "stop"
                        if hasattr(final_message, "stop_reason"):
                            finish_reason = {
                                "end_turn": "stop",
                                "max_tokens": "length",
                                "tool_use": "tool_calls",
                            }.get(final_message.stop_reason, "stop")

                        yield RunFinishedEvent(
                            type="RUN_FINISHED",
                            runId=run_id,
                            model=options.model,
                            timestamp=int(time.time() * 1000),
                            finishReason=finish_reason,
                            usage=usage,
                        )

        except Exception as e:
            # Emit RUN_ERROR
            yield RunErrorEvent(
                type="RUN_ERROR",
                runId=run_id,
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
