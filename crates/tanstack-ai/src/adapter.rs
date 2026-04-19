use async_trait::async_trait;
use futures_core::Stream;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, RequestBuilder, Response,
};
use std::pin::Pin;
use std::time::Duration;

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

pub(crate) fn build_http_client(config: &TextAdapterConfig) -> Client {
    let mut builder = Client::builder();

    if let Some(timeout_secs) = config.timeout {
        builder = builder.timeout(Duration::from_secs(timeout_secs));
    }

    if let Some(headers) = &config.headers {
        let mut default_headers = HeaderMap::new();
        for (name, value) in headers {
            let header_name =
                HeaderName::from_bytes(name.as_bytes()).expect("invalid adapter header name");
            let header_value = HeaderValue::from_str(value).expect("invalid adapter header value");
            default_headers.insert(header_name, header_value);
        }
        builder = builder.default_headers(default_headers);
    }

    builder
        .build()
        .expect("failed to build adapter http client")
}

pub(crate) async fn send_with_retries(
    request: RequestBuilder,
    max_retries: u32,
) -> Result<Response, reqwest::Error> {
    for attempt in 0..=max_retries {
        let response = request
            .try_clone()
            .expect("failed to clone request builder for retry")
            .send()
            .await;

        match response {
            Ok(response)
                if attempt < max_retries
                    && (response.status().is_server_error()
                        || response.status().as_u16() == 429) =>
            {
                continue;
            }
            Ok(response) => return Ok(response),
            Err(error) if attempt < max_retries => continue,
            Err(error) => return Err(error),
        }
    }

    unreachable!("retry loop always returns")
}

/// Placeholder traits for non-text capabilities.
///
/// The Rust SDK currently ships text adapters first, with these traits reserved
/// for upcoming image, summarization, speech, and transcription adapters.
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
