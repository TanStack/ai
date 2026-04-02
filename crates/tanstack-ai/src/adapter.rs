use async_trait::async_trait;
use futures_core::Stream;
use std::pin::Pin;

use crate::error::AiResult;
use crate::types::{StreamChunk, StructuredOutputOptions, StructuredOutputResult, TextOptions};

/// Configuration for adapter instances.
#[derive(Debug, Clone, Default)]
pub struct TextAdapterConfig {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub timeout: Option<u64>,
    pub max_retries: Option<u32>,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

/// A pinned, boxed stream of `StreamChunk` events.
pub type ChunkStream = Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>;

/// Core text adapter trait.
///
/// An adapter bridges the TanStack AI engine to a specific AI provider (OpenAI, Anthropic, etc.).
/// Providers implement this trait to handle streaming chat completions and structured output.
#[async_trait]
pub trait TextAdapter: Send + Sync {
    /// Provider name identifier (e.g., "openai", "anthropic").
    fn name(&self) -> &str;

    /// The model this adapter is configured for.
    fn model(&self) -> &str;

    /// Stream chat completions from the model, yielding AG-UI protocol events.
    async fn chat_stream(&self, options: &TextOptions) -> AiResult<ChunkStream>;

    /// Generate structured output using the provider's native structured output API.
    async fn structured_output(
        &self,
        options: &StructuredOutputOptions,
    ) -> AiResult<StructuredOutputResult>;
}

/// Image generation adapter trait.
#[async_trait]
pub trait ImageAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn model(&self) -> &str;

    async fn generate_image(
        &self,
        options: &crate::types::ImageGenerationOptions,
    ) -> AiResult<crate::types::ImageGenerationResult>;
}

/// Summarization adapter trait.
#[async_trait]
pub trait SummarizeAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn model(&self) -> &str;

    async fn summarize(
        &self,
        options: &crate::types::SummarizationOptions,
    ) -> AiResult<crate::types::SummarizationResult>;
}

/// Text-to-speech adapter trait.
#[async_trait]
pub trait TtsAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn model(&self) -> &str;

    async fn generate_speech(
        &self,
        options: &crate::types::TtsOptions,
    ) -> AiResult<crate::types::TtsResult>;
}

/// Transcription adapter trait.
#[async_trait]
pub trait TranscriptionAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn model(&self) -> &str;

    async fn transcribe(
        &self,
        options: &crate::types::TranscriptionOptions,
    ) -> AiResult<crate::types::TranscriptionResult>;
}
