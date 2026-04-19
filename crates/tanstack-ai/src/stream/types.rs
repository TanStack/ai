use crate::types::{StreamChunk, ToolCall, ToolCallState};

/// Internal state for a tool call being tracked during streaming.
#[derive(Debug, Clone)]
pub struct InternalToolCallState {
    pub id: String,
    pub name: String,
    pub arguments: String,
    pub state: ToolCallState,
    pub parsed_arguments: Option<serde_json::Value>,
    pub index: usize,
}

/// Strategy for determining when to emit text updates.
pub trait ChunkStrategy: Send + Sync {
    /// Called for each text chunk received. Returns true if an update should be emitted now.
    fn should_emit(&mut self, chunk: &str, accumulated: &str) -> bool;

    /// Reset strategy state (called when streaming starts).
    fn reset(&mut self) {}
}

/// Per-message streaming state.
#[derive(Debug)]
pub struct MessageStreamState {
    pub id: String,
    pub role: String,
    pub total_text_content: String,
    pub current_segment_text: String,
    pub last_emitted_text: String,
    pub thinking_content: String,
    pub tool_calls: std::collections::HashMap<String, InternalToolCallState>,
    pub tool_call_order: Vec<String>,
    pub has_tool_calls_since_text_start: bool,
    pub is_complete: bool,
}

impl MessageStreamState {
    pub fn new(id: impl Into<String>, role: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            role: role.into(),
            total_text_content: String::new(),
            current_segment_text: String::new(),
            last_emitted_text: String::new(),
            thinking_content: String::new(),
            tool_calls: std::collections::HashMap::new(),
            tool_call_order: Vec::new(),
            has_tool_calls_since_text_start: false,
            is_complete: false,
        }
    }
}

/// Result from processing a stream.
#[derive(Debug, Clone)]
pub struct ProcessorResult {
    pub content: String,
    pub thinking: Option<String>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub finish_reason: Option<String>,
}

/// Current state of the processor.
#[derive(Debug)]
pub struct ProcessorState {
    pub content: String,
    pub thinking: String,
    pub tool_calls: std::collections::HashMap<String, InternalToolCallState>,
    pub tool_call_order: Vec<String>,
    pub finish_reason: Option<String>,
    pub done: bool,
}

/// Recording format for replay testing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChunkRecording {
    pub version: String,
    pub timestamp: f64,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub chunks: Vec<RecordedChunk>,
    pub result: Option<ProcessorResultSerde>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecordedChunk {
    pub chunk: StreamChunk,
    pub timestamp: f64,
    pub index: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessorResultSerde {
    pub content: String,
    pub thinking: Option<String>,
    pub finish_reason: Option<String>,
}
