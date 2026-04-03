//! Test utilities for tanstack-ai tests.
//!
//! Provides a mock adapter, chunk factories, and helpers mirroring
//! the TypeScript test-utils.ts.

use async_trait::async_trait;
use futures_util::stream;
use std::sync::{Arc, Mutex};
use tanstack_ai::adapter::{ChunkStream, TextAdapter};
use tanstack_ai::error::AiResult;
use tanstack_ai::types::*;

// ============================================================================
// Chunk factory helpers
// ============================================================================

pub fn now() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64 / 1000.0
}

pub fn run_started(run_id: &str) -> StreamChunk {
    StreamChunk::RunStarted {
        timestamp: now(),
        run_id: run_id.to_string(),
        thread_id: None,
        model: Some("mock-model".to_string()),
    }
}

pub fn text_start(message_id: &str) -> StreamChunk {
    StreamChunk::TextMessageStart {
        timestamp: now(),
        message_id: message_id.to_string(),
        role: "assistant".to_string(),
        model: Some("mock-model".to_string()),
    }
}

pub fn text_content(delta: &str, message_id: &str) -> StreamChunk {
    StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: message_id.to_string(),
        delta: delta.to_string(),
        content: None,
        model: Some("mock-model".to_string()),
    }
}

pub fn _text_content_with_full(delta: &str, full: &str, message_id: &str) -> StreamChunk {
    StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: message_id.to_string(),
        delta: delta.to_string(),
        content: Some(full.to_string()),
        model: Some("mock-model".to_string()),
    }
}

pub fn text_end(message_id: &str) -> StreamChunk {
    StreamChunk::TextMessageEnd {
        timestamp: now(),
        message_id: message_id.to_string(),
        model: Some("mock-model".to_string()),
    }
}

pub fn tool_start(tool_call_id: &str, tool_name: &str, index: Option<usize>) -> StreamChunk {
    StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: tool_call_id.to_string(),
        tool_name: tool_name.to_string(),
        parent_message_id: None,
        index,
        provider_metadata: None,
        model: Some("mock-model".to_string()),
    }
}

pub fn tool_args(tool_call_id: &str, delta: &str) -> StreamChunk {
    StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: tool_call_id.to_string(),
        delta: delta.to_string(),
        args: None,
        model: Some("mock-model".to_string()),
    }
}

pub fn _tool_end(
    tool_call_id: &str,
    tool_name: &str,
    input: Option<serde_json::Value>,
    result: Option<String>,
) -> StreamChunk {
    StreamChunk::ToolCallEnd {
        timestamp: now(),
        tool_call_id: tool_call_id.to_string(),
        tool_name: tool_name.to_string(),
        input,
        result,
        model: Some("mock-model".to_string()),
    }
}

pub fn run_finished(finish_reason: &str, run_id: &str) -> StreamChunk {
    StreamChunk::RunFinished {
        timestamp: now(),
        run_id: run_id.to_string(),
        finish_reason: Some(finish_reason.to_string()),
        usage: None,
        model: Some("mock-model".to_string()),
    }
}

pub fn run_error(message: &str, run_id: &str) -> StreamChunk {
    StreamChunk::RunError {
        timestamp: now(),
        run_id: Some(run_id.to_string()),
        error: RunErrorData {
            message: message.to_string(),
            code: None,
        },
        model: Some("mock-model".to_string()),
    }
}

pub fn step_finished(delta: &str, step_id: &str) -> StreamChunk {
    StreamChunk::StepFinished {
        timestamp: now(),
        step_id: step_id.to_string(),
        delta: delta.to_string(),
        content: None,
        model: Some("mock-model".to_string()),
    }
}

// ============================================================================
// Mock adapter
// ============================================================================

/// Tracks calls made to the mock adapter.
#[derive(Debug, Clone)]
pub struct MockCall {
    pub messages: Vec<ModelMessage>,
    pub _tools: Vec<String>,
    pub system_prompts: Vec<String>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
}

/// A mock adapter that returns predetermined chunks per iteration.
pub struct MockAdapter {
    iterations: Vec<Vec<StreamChunk>>,
    calls: Arc<Mutex<Vec<MockCall>>>,
    call_index: Arc<Mutex<usize>>,
}

impl MockAdapter {
    pub fn new(iterations: Vec<Vec<StreamChunk>>) -> Self {
        Self {
            iterations,
            calls: Arc::new(Mutex::new(Vec::new())),
            call_index: Arc::new(Mutex::new(0)),
        }
    }

    pub fn calls(&self) -> Vec<MockCall> {
        self.calls.lock().unwrap().clone()
    }

    pub fn call_count(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
}

#[async_trait]
impl TextAdapter for MockAdapter {
    fn name(&self) -> &str {
        "mock"
    }

    fn model(&self) -> &str {
        "mock-model"
    }

    async fn chat_stream(&self, options: &TextOptions) -> AiResult<ChunkStream> {
        // Record the call
        let call = MockCall {
            messages: options.messages.clone(),
            _tools: options.tools.iter().map(|t| t.name.clone()).collect(),
            system_prompts: options.system_prompts.clone(),
            temperature: options.temperature,
            top_p: options.top_p,
            max_tokens: options.max_tokens,
        };
        self.calls.lock().unwrap().push(call);

        // Get chunks for this iteration
        let mut idx = self.call_index.lock().unwrap();
        let chunks = self.iterations.get(*idx).cloned().unwrap_or_default();
        *idx += 1;

        let stream = stream::iter(chunks.into_iter().map(Ok));
        Ok(Box::pin(stream))
    }

    async fn structured_output(
        &self,
        _options: &StructuredOutputOptions,
    ) -> AiResult<StructuredOutputResult> {
        Ok(StructuredOutputResult {
            data: serde_json::json!({}),
            raw_text: "{}".to_string(),
        })
    }
}

// ============================================================================
// Collect helper
// ============================================================================

/// Collect all text content from chunks.
pub fn collect_text(chunks: &[StreamChunk]) -> String {
    let mut content = String::new();
    for chunk in chunks {
        if let StreamChunk::TextMessageContent {
            delta,
            content: full,
            ..
        } = chunk
        {
            if let Some(full_content) = full {
                content = full_content.clone();
            } else {
                content.push_str(delta);
            }
        }
    }
    content
}

/// Count chunks of a specific type.
pub fn count_chunk_type(chunks: &[StreamChunk], chunk_type: &str) -> usize {
    chunks
        .iter()
        .filter(|c| match chunk_type {
            "RUN_STARTED" => matches!(c, StreamChunk::RunStarted { .. }),
            "RUN_FINISHED" => matches!(c, StreamChunk::RunFinished { .. }),
            "TEXT_MESSAGE_START" => matches!(c, StreamChunk::TextMessageStart { .. }),
            "TEXT_MESSAGE_CONTENT" => matches!(c, StreamChunk::TextMessageContent { .. }),
            "TEXT_MESSAGE_END" => matches!(c, StreamChunk::TextMessageEnd { .. }),
            "TOOL_CALL_START" => matches!(c, StreamChunk::ToolCallStart { .. }),
            "TOOL_CALL_ARGS" => matches!(c, StreamChunk::ToolCallArgs { .. }),
            "TOOL_CALL_END" => matches!(c, StreamChunk::ToolCallEnd { .. }),
            _ => false,
        })
        .count()
}

/// Helper to create a simple server tool for testing.
pub fn server_tool(name: &str, result: serde_json::Value) -> Tool {
    let result_clone = result.clone();
    Tool::new(name, format!("Test tool: {}", name)).with_execute(
        move |_args: serde_json::Value, _ctx: tanstack_ai::types::ToolExecutionContext| {
            let r = result_clone.clone();
            async move { Ok(r) }
        },
    )
}

/// Helper to create a server tool that captures its arguments.
pub fn capturing_tool(name: &str) -> (Tool, Arc<Mutex<Vec<serde_json::Value>>>) {
    let captured: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
    let captured_clone = captured.clone();
    let tool = Tool::new(name, format!("Capturing tool: {}", name)).with_execute(
        move |args: serde_json::Value, _ctx: tanstack_ai::types::ToolExecutionContext| {
            let c = captured_clone.clone();
            async move {
                c.lock().unwrap().push(args.clone());
                Ok(args)
            }
        },
    );
    (tool, captured)
}
