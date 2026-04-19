use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ============================================================================
// Tool Call States
// ============================================================================

/// Lifecycle state of a tool call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ToolCallState {
    /// Received start but no arguments yet.
    AwaitingInput,
    /// Partial arguments received.
    InputStreaming,
    /// All arguments received.
    InputComplete,
    /// Waiting for user approval.
    ApprovalRequested,
    /// User has approved/denied.
    ApprovalResponded,
}

/// Lifecycle state of a tool result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ToolResultState {
    /// Placeholder for future streamed output.
    Streaming,
    /// Result is complete.
    Complete,
    /// Error occurred.
    Error,
}

// ============================================================================
// JSON Schema
// ============================================================================

/// JSON Schema type for defining tool input/output schemas.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JsonSchema {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "$ref")]
    pub r#ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "$defs")]
    pub defs: Option<HashMap<String, JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub all_of: Option<Vec<JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub any_of: Option<Vec<JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_of: Option<Vec<JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_length: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_properties: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

// ============================================================================
// Multimodal Content Types
// ============================================================================

/// Supported input modality types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Modality {
    Text,
    Image,
    Audio,
    Video,
    Document,
}

/// Source for inline data content (base64).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ContentPartSource {
    /// Inline base64 data.
    Data { value: String, mime_type: String },
    /// URL-referenced content.
    Url {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        mime_type: Option<String>,
    },
}

/// Image content part.
#[derive(Debug, Clone, Serialize)]
pub struct ImagePart {
    #[serde(rename = "type")]
    pub part_type: &'static str, // always "image"
    pub source: ContentPartSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Audio content part.
#[derive(Debug, Clone, Serialize)]
pub struct AudioPart {
    #[serde(rename = "type")]
    pub part_type: &'static str,
    pub source: ContentPartSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Video content part.
#[derive(Debug, Clone, Serialize)]
pub struct VideoPart {
    #[serde(rename = "type")]
    pub part_type: &'static str,
    pub source: ContentPartSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Document content part (e.g., PDFs).
#[derive(Debug, Clone, Serialize)]
pub struct DocumentPart {
    #[serde(rename = "type")]
    pub part_type: &'static str,
    pub source: ContentPartSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Union type for all multimodal content parts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ContentPart {
    Text { content: String },
    Image { source: ContentPartSource },
    Audio { source: ContentPartSource },
    Video { source: ContentPartSource },
    Document { source: ContentPartSource },
}

// ============================================================================
// Message Types
// ============================================================================

/// A message in the conversation with a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMessage {
    pub role: MessageRole,
    pub content: MessageContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// Message role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// Message content — can be simple text, null, or multimodal parts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Parts(Vec<ContentPart>),
    Null,
}

impl MessageContent {
    pub fn text(s: impl Into<String>) -> Self {
        MessageContent::Text(s.into())
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            MessageContent::Text(s) => Some(s.as_str()),
            _ => None,
        }
    }
}

// ============================================================================
// Tool Call
// ============================================================================

/// A tool call from the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String, // always "function"
    pub function: ToolCallFunction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_metadata: Option<serde_json::Value>,
}

/// Function details within a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String, // JSON string
}

// ============================================================================
// UI Message & Parts
// ============================================================================

/// Domain-specific message format optimized for chat UIs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiMessage {
    pub id: String,
    pub role: UiMessageRole,
    pub parts: Vec<MessagePart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Role for UI messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UiMessageRole {
    System,
    User,
    Assistant,
}

/// A part of a UI message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum MessagePart {
    Text {
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<serde_json::Value>,
    },
    Image {
        source: ContentPartSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<serde_json::Value>,
    },
    Audio {
        source: ContentPartSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<serde_json::Value>,
    },
    Video {
        source: ContentPartSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<serde_json::Value>,
    },
    Document {
        source: ContentPartSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<serde_json::Value>,
    },
    ToolCall {
        id: String,
        name: String,
        arguments: String,
        state: ToolCallState,
        #[serde(skip_serializing_if = "Option::is_none")]
        approval: Option<ToolCallApproval>,
        #[serde(skip_serializing_if = "Option::is_none")]
        output: Option<serde_json::Value>,
    },
    ToolResult {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        content: String,
        state: ToolResultState,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Thinking {
        content: String,
    },
}

/// Approval metadata for a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallApproval {
    pub id: String,
    pub needs_approval: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved: Option<bool>,
}

// ============================================================================
// Tool Definition
// ============================================================================

/// Tool/Function definition for function calling.
#[derive(Clone)]
pub struct Tool {
    /// Unique name (used by the model to call it).
    pub name: String,
    /// Description of what the tool does.
    pub description: String,
    /// JSON Schema for input parameters.
    pub input_schema: Option<JsonSchema>,
    /// JSON Schema for output validation.
    pub output_schema: Option<JsonSchema>,
    /// If true, tool execution requires user approval.
    pub needs_approval: bool,
    /// If true, this tool is lazy and discovered on-demand.
    pub lazy: bool,
    /// Additional metadata.
    pub metadata: Option<serde_json::Value>,
    /// Execute function (server-side tools).
    pub execute: Option<ToolExecuteFn>,
}

/// Type for tool execute functions.
pub type ToolExecuteFn =
    std::sync::Arc<dyn Fn(serde_json::Value, ToolExecutionContext) -> ToolFuture + Send + Sync>;

/// Future returned by tool execute functions.
pub type ToolFuture =
    std::pin::Pin<Box<dyn std::future::Future<Output = AiResult<serde_json::Value>> + Send>>;

/// Context passed to tool execute functions.
#[derive(Debug, Clone)]
pub struct ToolExecutionContext {
    pub tool_call_id: Option<String>,
    pub custom_event_tx: Option<tokio::sync::mpsc::UnboundedSender<CustomEventData>>,
}

impl ToolExecutionContext {
    /// Emit a custom event during tool execution.
    pub fn emit_custom_event(&self, event_name: &str, value: serde_json::Value) {
        if let Some(tx) = &self.custom_event_tx {
            let _ = tx.send(CustomEventData {
                name: event_name.to_string(),
                value,
                tool_call_id: self.tool_call_id.clone(),
            });
        }
    }
}

/// Data for a custom event emitted during tool execution.
#[derive(Debug, Clone)]
pub struct CustomEventData {
    pub name: String,
    pub value: serde_json::Value,
    pub tool_call_id: Option<String>,
}

impl Tool {
    /// Create a new tool definition.
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema: None,
            output_schema: None,
            needs_approval: false,
            lazy: false,
            metadata: None,
            execute: None,
        }
    }

    /// Set the input schema.
    pub fn with_input_schema(mut self, schema: JsonSchema) -> Self {
        self.input_schema = Some(schema);
        self
    }

    /// Set the output schema.
    pub fn with_output_schema(mut self, schema: JsonSchema) -> Self {
        self.output_schema = Some(schema);
        self
    }

    /// Mark this tool as requiring approval.
    pub fn with_approval(mut self) -> Self {
        self.needs_approval = true;
        self
    }

    /// Mark this tool as lazy.
    pub fn with_lazy(mut self) -> Self {
        self.lazy = true;
        self
    }

    /// Set the execute function.
    pub fn with_execute<F, Fut>(mut self, f: F) -> Self
    where
        F: Fn(serde_json::Value, ToolExecutionContext) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = AiResult<serde_json::Value>> + Send + 'static,
    {
        self.execute = Some(std::sync::Arc::new(move |args, ctx| Box::pin(f(args, ctx))));
        self
    }
}

// ============================================================================
// AG-UI Protocol Event Types
// ============================================================================

/// AG-UI Protocol event types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AguiEventType {
    RunStarted,
    RunFinished,
    RunError,
    TextMessageStart,
    TextMessageContent,
    TextMessageEnd,
    ToolCallStart,
    ToolCallArgs,
    ToolCallEnd,
    StepStarted,
    StepFinished,
    MessagesSnapshot,
    StateSnapshot,
    StateDelta,
    Custom,
}

/// Token usage statistics.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Finish reason from the model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    Length,
    ContentFilter,
    ToolCalls,
}

/// Stream chunk / AG-UI event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StreamChunk {
    #[serde(rename_all = "camelCase")]
    RunStarted {
        timestamp: f64,
        run_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        thread_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    RunFinished {
        timestamp: f64,
        run_id: String,
        finish_reason: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<Usage>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    RunError {
        timestamp: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        run_id: Option<String>,
        error: RunErrorData,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TextMessageStart {
        timestamp: f64,
        message_id: String,
        role: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TextMessageContent {
        timestamp: f64,
        message_id: String,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TextMessageEnd {
        timestamp: f64,
        message_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ToolCallStart {
        timestamp: f64,
        tool_call_id: String,
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        parent_message_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
        #[serde(skip_serializing_if = "Option::is_none")]
        provider_metadata: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ToolCallArgs {
        timestamp: f64,
        tool_call_id: String,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ToolCallEnd {
        timestamp: f64,
        tool_call_id: String,
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        input: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    StepStarted {
        timestamp: f64,
        step_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        step_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    StepFinished {
        timestamp: f64,
        step_id: String,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    MessagesSnapshot {
        timestamp: f64,
        messages: Vec<UiMessage>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    StateSnapshot {
        timestamp: f64,
        state: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    StateDelta {
        timestamp: f64,
        delta: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Custom {
        timestamp: f64,
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
}

/// Error data in a RUN_ERROR event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunErrorData {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

impl StreamChunk {
    /// Get the event type of this chunk.
    pub fn event_type(&self) -> AguiEventType {
        match self {
            StreamChunk::RunStarted { .. } => AguiEventType::RunStarted,
            StreamChunk::RunFinished { .. } => AguiEventType::RunFinished,
            StreamChunk::RunError { .. } => AguiEventType::RunError,
            StreamChunk::TextMessageStart { .. } => AguiEventType::TextMessageStart,
            StreamChunk::TextMessageContent { .. } => AguiEventType::TextMessageContent,
            StreamChunk::TextMessageEnd { .. } => AguiEventType::TextMessageEnd,
            StreamChunk::ToolCallStart { .. } => AguiEventType::ToolCallStart,
            StreamChunk::ToolCallArgs { .. } => AguiEventType::ToolCallArgs,
            StreamChunk::ToolCallEnd { .. } => AguiEventType::ToolCallEnd,
            StreamChunk::StepStarted { .. } => AguiEventType::StepStarted,
            StreamChunk::StepFinished { .. } => AguiEventType::StepFinished,
            StreamChunk::MessagesSnapshot { .. } => AguiEventType::MessagesSnapshot,
            StreamChunk::StateSnapshot { .. } => AguiEventType::StateSnapshot,
            StreamChunk::StateDelta { .. } => AguiEventType::StateDelta,
            StreamChunk::Custom { .. } => AguiEventType::Custom,
        }
    }
}

// ============================================================================
// Configuration Types
// ============================================================================

/// State passed to agent loop strategy functions.
#[derive(Debug, Clone)]
pub struct AgentLoopState {
    pub iteration_count: u32,
    pub messages: Vec<ModelMessage>,
    pub finish_reason: Option<String>,
}

/// Strategy function that determines whether the agent loop should continue.
pub type AgentLoopStrategy = Arc<dyn Fn(&AgentLoopState) -> bool + Send + Sync>;

/// Options for text generation / chat.
#[derive(Clone)]
pub struct TextOptions {
    pub model: String,
    pub messages: Vec<ModelMessage>,
    pub tools: Vec<Tool>,
    pub system_prompts: Vec<String>,
    pub agent_loop_strategy: Option<AgentLoopStrategy>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
    pub metadata: Option<serde_json::Value>,
    pub model_options: Option<serde_json::Value>,
    pub output_schema: Option<JsonSchema>,
    pub conversation_id: Option<String>,
}

impl Default for TextOptions {
    fn default() -> Self {
        Self {
            model: String::new(),
            messages: Vec::new(),
            tools: Vec::new(),
            system_prompts: Vec::new(),
            agent_loop_strategy: None,
            temperature: None,
            top_p: None,
            max_tokens: None,
            metadata: None,
            model_options: None,
            output_schema: None,
            conversation_id: None,
        }
    }
}

/// Options for structured output generation.
#[derive(Clone)]
pub struct StructuredOutputOptions {
    pub chat_options: TextOptions,
    pub output_schema: JsonSchema,
}

/// Result from structured output generation.
#[derive(Debug, Clone)]
pub struct StructuredOutputResult {
    pub data: serde_json::Value,
    pub raw_text: String,
}

// ============================================================================
// Agent Loop Strategies
// ============================================================================

/// Continue for up to `max` iterations.
pub fn max_iterations(max: u32) -> AgentLoopStrategy {
    Arc::new(move |state: &AgentLoopState| state.iteration_count < max)
}

/// Continue until a specific finish reason is received.
pub fn until_finish_reason(reason: impl Into<String>) -> AgentLoopStrategy {
    let reason = reason.into();
    Arc::new(move |state: &AgentLoopState| state.finish_reason.as_ref() != Some(&reason))
}

/// Combine multiple strategies with AND logic (all must return true).
pub fn combine_strategies(strategies: Vec<AgentLoopStrategy>) -> AgentLoopStrategy {
    Arc::new(move |state: &AgentLoopState| strategies.iter().all(|s| s(state)))
}

// ============================================================================
// Summarization, Image, Video, TTS, Transcription Types
// ============================================================================

/// Options for summarization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationOptions {
    pub model: String,
    pub text: String,
    pub max_length: Option<u32>,
    pub style: Option<String>,
    pub focus: Option<Vec<String>>,
}

/// Result of summarization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationResult {
    pub id: String,
    pub model: String,
    pub summary: String,
    pub usage: Usage,
}

/// Options for image generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationOptions {
    pub model: String,
    pub prompt: String,
    pub number_of_images: Option<u32>,
    pub size: Option<String>,
}

/// A generated image.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    pub b64_json: Option<String>,
    pub url: Option<String>,
    pub revised_prompt: Option<String>,
}

/// Result of image generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationResult {
    pub id: String,
    pub model: String,
    pub images: Vec<GeneratedImage>,
    pub usage: Option<Usage>,
}

/// Options for text-to-speech.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsOptions {
    pub model: String,
    pub text: String,
    pub voice: Option<String>,
    pub format: Option<String>,
    pub speed: Option<f64>,
}

/// Result of text-to-speech.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsResult {
    pub id: String,
    pub model: String,
    pub audio: String, // base64
    pub format: String,
    pub duration: Option<f64>,
    pub content_type: Option<String>,
}

/// Options for transcription.
#[derive(Debug, Clone)]
pub struct TranscriptionOptions {
    pub model: String,
    pub audio: Vec<u8>,
    pub language: Option<String>,
    pub prompt: Option<String>,
    pub response_format: Option<String>,
}

/// A transcribed segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub confidence: Option<f64>,
    pub speaker: Option<String>,
}

/// Result of transcription.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub id: String,
    pub model: String,
    pub text: String,
    pub language: Option<String>,
    pub duration: Option<f64>,
    pub segments: Option<Vec<TranscriptionSegment>>,
}

use crate::error::AiResult;

impl MessageRole {
    /// Get the string representation of the role for API requests.
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::System => "system",
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::Tool => "tool",
        }
    }
}

impl std::fmt::Debug for Tool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Tool")
            .field("name", &self.name)
            .field("description", &self.description)
            .field("input_schema", &self.input_schema)
            .field("output_schema", &self.output_schema)
            .field("needs_approval", &self.needs_approval)
            .field("lazy", &self.lazy)
            .field("metadata", &self.metadata)
            .field("execute", &self.execute.as_ref().map(|_| "<fn>"))
            .finish()
    }
}
