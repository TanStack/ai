//! # tanstack-ai
//!
//! Type-safe, provider-agnostic AI SDK for Rust.
//!
//! This crate provides a comprehensive toolkit for building AI-powered applications
//! with support for multiple providers (OpenAI, Anthropic, Gemini), streaming responses,
//! tool calling with agent loops, and framework-agnostic state management.
//!
//! ## Core Concepts
//!
//! ### Adapters
//! Adapters bridge the SDK to specific AI providers. Each provider has its own adapter:
//! - [`OpenAiTextAdapter`] — OpenAI Responses API
//! - [`AnthropicTextAdapter`] — Anthropic Messages API
//! - [`GeminiTextAdapter`] — Google Gemini API
//!
//! ### Chat
//! The [`chat`] function is the main entry point for text generation:
//! - Streaming with automatic tool execution (agentic loop)
//! - Non-streaming (collected text)
//! - Structured output with schema validation
//!
//! ### Tools
//! Tools enable the model to interact with external systems:
//! - [`Tool`] — Tool definition with schemas and execute function
//! - [`ToolDefinition`] — Builder for creating tools
//! - [`ToolRegistry`] — Registry for managing available tools
//!
//! ### Streaming
//! The streaming system uses the AG-UI protocol with typed events:
//! - [`StreamChunk`] — Union of all AG-UI event types
//! - [`StreamProcessor`] — State machine for processing streams
//! - Chunk strategies for controlling emission frequency
//!
//! ### Middleware
//! The middleware system allows observing and transforming chat behavior:
//! - [`ChatMiddleware`] — Trait for implementing middleware
//! - [`MiddlewareRunner`] — Composes multiple middlewares
//!
//! ### Chat Client
//! The [`ChatClient`] provides headless state management:
//! - Connection adapters (SSE, HTTP stream, custom)
//! - Subscription-based state updates
//! - Framework-agnostic design

pub mod adapter;
pub mod adapters;
pub mod chat;
pub mod client;
pub mod error;
pub mod messages;
pub mod middleware;
pub mod stream;
pub mod stream_response;
pub mod tools;
pub mod types;

// Re-export main types and functions
pub use adapter::*;
pub use adapters::*;
pub use chat::*;
pub use client::*;
pub use error::*;
pub use messages::*;
pub use middleware::*;
pub use stream::*;
pub use stream_response::*;
pub use tools::*;
pub use types::*;

/// Convenience function to create a chat with an OpenAI model.
pub fn openai_text(
    model: impl Into<String>,
    api_key: impl Into<String>,
) -> OpenAiTextAdapter {
    OpenAiTextAdapter::new(model, api_key)
}

/// Convenience function to create a chat with an Anthropic model.
pub fn anthropic_text(
    model: impl Into<String>,
    api_key: impl Into<String>,
) -> AnthropicTextAdapter {
    AnthropicTextAdapter::new(model, api_key)
}

/// Convenience function to create a chat with a Gemini model.
pub fn gemini_text(
    model: impl Into<String>,
    api_key: impl Into<String>,
) -> GeminiTextAdapter {
    GeminiTextAdapter::new(model, api_key)
}

/// Create adapter from environment variables.
///
/// Looks for provider-specific API keys:
/// - OpenAI: `OPENAI_API_KEY`
/// - Anthropic: `ANTHROPIC_API_KEY`
/// - Gemini: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
pub fn openai_text_from_env(model: impl Into<String>) -> AiResult<OpenAiTextAdapter> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| AiError::Other("OPENAI_API_KEY not set".to_string()))?;
    Ok(OpenAiTextAdapter::new(model, api_key))
}

/// Create Anthropic adapter from environment variables.
pub fn anthropic_text_from_env(model: impl Into<String>) -> AiResult<AnthropicTextAdapter> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| AiError::Other("ANTHROPIC_API_KEY not set".to_string()))?;
    Ok(AnthropicTextAdapter::new(model, api_key))
}

/// Create Gemini adapter from environment variables.
pub fn gemini_text_from_env(model: impl Into<String>) -> AiResult<GeminiTextAdapter> {
    let api_key = std::env::var("GEMINI_API_KEY")
        .or_else(|_| std::env::var("GOOGLE_API_KEY"))
        .map_err(|_| AiError::Other("GEMINI_API_KEY or GOOGLE_API_KEY not set".to_string()))?;
    Ok(GeminiTextAdapter::new(model, api_key))
}

/// Detect image MIME type from bytes.
pub fn detect_image_mime_type(data: &[u8]) -> &'static str {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        "image/gif"
    } else if data.starts_with(b"RIFF") && data.len() > 12 && &data[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_image_mime_type() {
        let png_header = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(detect_image_mime_type(png_header), "image/png");

        let jpeg_header = &[0xFF, 0xD8, 0xFF, 0xE0];
        assert_eq!(detect_image_mime_type(jpeg_header), "image/jpeg");
    }

    #[test]
    fn test_tool_builder() {
        let tool = Tool::new("get_weather", "Get the weather for a location")
            .with_input_schema(json_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "location": { "type": "string" }
                },
                "required": ["location"]
            })))
            .with_approval();

        assert_eq!(tool.name, "get_weather");
        assert!(tool.needs_approval);
        assert!(tool.input_schema.is_some());
    }

    #[test]
    fn test_stream_chunk_serialization() {
        let chunk = StreamChunk::TextMessageContent {
            timestamp: 1234567890.0,
            message_id: "msg-123".to_string(),
            delta: "Hello".to_string(),
            content: None,
            model: Some("gpt-4o".to_string()),
        };

        let json = serde_json::to_string(&chunk).unwrap();
        assert!(json.contains("\"type\":\"TEXT_MESSAGE_CONTENT\""));
        assert!(json.contains("\"delta\":\"Hello\""));

        let deserialized: StreamChunk = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.event_type(), AguiEventType::TextMessageContent);
    }

    #[test]
    fn test_model_message_serialization() {
        let msg = ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hello!".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        };

        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: ModelMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.role, MessageRole::User);
        assert_eq!(deserialized.content.as_str(), Some("Hello!"));
    }

    #[test]
    fn test_agent_loop_strategies() {
        let strategy = max_iterations(3);
        let state = AgentLoopState {
            iteration_count: 2,
            messages: vec![],
            finish_reason: None,
        };
        assert!(strategy(&state));

        let state = AgentLoopState {
            iteration_count: 3,
            messages: vec![],
            finish_reason: None,
        };
        assert!(!strategy(&state));
    }

    #[test]
    fn test_tool_definition_builder() {
        let def = tool_definition("search", "Search the web")
            .input_schema(json_schema(serde_json::json!({
                "type": "object",
                "properties": { "query": { "type": "string" } }
            })))
            .needs_approval(false)
            .lazy(true);

        assert_eq!(def.name, "search");
        assert!(def.lazy);
        assert!(def.input_schema.is_some());

        let tool = def.to_tool();
        assert_eq!(tool.name, "search");
        assert!(!tool.needs_approval);
    }
}
