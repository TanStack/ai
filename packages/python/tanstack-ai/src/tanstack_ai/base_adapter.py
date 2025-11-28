"""
Base adapter class for AI providers.

All AI adapters should inherit from this class and implement the required methods.
"""

import time
from abc import ABC, abstractmethod
from typing import AsyncIterator, List

from .types import (
    AIAdapterConfig,
    ChatOptions,
    EmbeddingOptions,
    EmbeddingResult,
    StreamChunk,
    SummarizationOptions,
    SummarizationResult,
)


class BaseAdapter(ABC):
    """
    Base adapter class with support for endpoint-specific models and provider options.

    All concrete adapters (OpenAI, Anthropic, etc.) should inherit from this class
    and implement the abstract methods.
    """

    def __init__(self, config: AIAdapterConfig = AIAdapterConfig()):
        """
        Initialize the adapter.

        Args:
            config: Configuration for the adapter (API key, base URL, etc.)
        """
        self.config = config

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the adapter (e.g., 'openai', 'anthropic')."""
        pass

    @property
    @abstractmethod
    def models(self) -> List[str]:
        """List of models that support chat/text completion."""
        pass

    @property
    def embedding_models(self) -> List[str]:
        """List of models that support embeddings."""
        return []

    @abstractmethod
    async def chat_stream(self, options: ChatOptions) -> AsyncIterator[StreamChunk]:
        """
        Stream chat completions with structured JSON chunks.

        Args:
            options: Chat options including model, messages, tools, etc.

        Yields:
            StreamChunk objects (content, tool_call, tool_result, done, error, etc.)
        """
        pass

    @abstractmethod
    async def summarize(self, options: SummarizationOptions) -> SummarizationResult:
        """
        Summarize text.

        Args:
            options: Summarization options

        Returns:
            SummarizationResult with the summary and usage info
        """
        pass

    @abstractmethod
    async def create_embeddings(self, options: EmbeddingOptions) -> EmbeddingResult:
        """
        Create embeddings for text.

        Args:
            options: Embedding options

        Returns:
            EmbeddingResult with embeddings and usage info
        """
        pass

    def _generate_id(self) -> str:
        """Generate a unique ID for requests."""
        import random
        import string

        timestamp = int(time.time() * 1000)
        random_suffix = "".join(
            random.choices(string.ascii_lowercase + string.digits, k=7)
        )
        return f"{self.name}-{timestamp}-{random_suffix}"
