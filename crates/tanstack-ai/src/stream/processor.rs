use crate::stream::strategies::ImmediateStrategy;
use crate::stream::types::*;
use crate::types::{StreamChunk, ToolCall, ToolCallFunction, ToolCallState};

/// Core stream processing state machine.
///
/// Manages full UIMessage conversation state, tracks per-message stream state,
/// handles text accumulation with configurable chunking strategies, manages
/// parallel tool calls with lifecycle state tracking, and supports
/// thinking/reasoning content.
pub struct StreamProcessor {
    messages: Vec<MessageStreamState>,
    current_message: Option<MessageStreamState>,
    chunk_strategy: Box<dyn ChunkStrategy>,
    recordings: Vec<RecordedChunk>,
    recording_enabled: bool,
}

impl StreamProcessor {
    /// Create a new StreamProcessor with the default immediate chunk strategy.
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            current_message: None,
            chunk_strategy: Box::new(ImmediateStrategy),
            recordings: Vec::new(),
            recording_enabled: false,
        }
    }

    /// Create a new StreamProcessor with a custom chunk strategy.
    pub fn with_strategy(strategy: Box<dyn ChunkStrategy>) -> Self {
        Self {
            messages: Vec::new(),
            current_message: None,
            chunk_strategy: strategy,
            recordings: Vec::new(),
            recording_enabled: false,
        }
    }

    /// Enable recording for replay testing.
    pub fn enable_recording(&mut self) {
        self.recording_enabled = true;
    }

    /// Get the recorded chunks.
    pub fn recordings(&self) -> &[RecordedChunk] {
        &self.recordings
    }

    /// Process a single stream chunk, updating internal state.
    ///
    /// Returns the processed chunk if it should be emitted to the UI.
    pub fn process_chunk(&mut self, chunk: StreamChunk) -> Option<StreamChunk> {
        if self.recording_enabled {
            self.recordings.push(RecordedChunk {
                chunk: chunk.clone(),
                timestamp: chrono::Utc::now().timestamp_millis() as f64 / 1000.0,
                index: self.recordings.len(),
            });
        }

        match &chunk {
            StreamChunk::TextMessageStart {
                message_id, role, ..
            } => {
                let state = MessageStreamState::new(message_id.clone(), role.clone());
                self.current_message = Some(state);
                Some(chunk)
            }

            StreamChunk::TextMessageContent {
                message_id: _,
                delta,
                content,
                ..
            } => {
                if let Some(msg) = &mut self.current_message {
                    if let Some(full_content) = content {
                        msg.total_text_content = full_content.clone();
                    } else {
                        msg.total_text_content.push_str(delta);
                        msg.current_segment_text.push_str(delta);
                    }

                    if self
                        .chunk_strategy
                        .should_emit(delta, &msg.total_text_content)
                    {
                        msg.last_emitted_text = msg.total_text_content.clone();
                        msg.current_segment_text.clear();
                        Some(chunk)
                    } else {
                        None
                    }
                } else {
                    Some(chunk)
                }
            }

            StreamChunk::TextMessageEnd { .. } => {
                if let Some(msg) = &mut self.current_message {
                    // Flush any remaining text that wasn't emitted
                    if !msg.current_segment_text.is_empty() {
                        msg.last_emitted_text = msg.total_text_content.clone();
                        msg.current_segment_text.clear();
                    }
                    msg.is_complete = true;
                    if let Some(completed) = self.current_message.take() {
                        self.messages.push(completed);
                    }
                }
                self.chunk_strategy.reset();
                Some(chunk)
            }

            StreamChunk::ToolCallStart {
                tool_call_id,
                tool_name,
                index,
                ..
            } => {
                // Auto-create a current message if none exists
                if self.current_message.is_none() {
                    self.current_message = Some(MessageStreamState::new("auto-msg", "assistant"));
                }
                if let Some(msg) = &mut self.current_message {
                    let tc_state = InternalToolCallState {
                        id: tool_call_id.clone(),
                        name: tool_name.clone(),
                        arguments: String::new(),
                        state: ToolCallState::AwaitingInput,
                        parsed_arguments: None,
                        index: index.unwrap_or(msg.tool_calls.len()),
                    };
                    msg.tool_calls.insert(tool_call_id.clone(), tc_state);
                    msg.tool_call_order.push(tool_call_id.clone());
                    msg.has_tool_calls_since_text_start = true;
                }
                Some(chunk)
            }

            StreamChunk::ToolCallArgs {
                tool_call_id,
                delta,
                ..
            } => {
                if let Some(msg) = &mut self.current_message {
                    if let Some(tc) = msg.tool_calls.get_mut(tool_call_id) {
                        tc.arguments.push_str(delta);
                        tc.state = ToolCallState::InputStreaming;
                        tc.parsed_arguments =
                            crate::stream::json_parser::parse_partial_json(&tc.arguments);
                    }
                }
                Some(chunk)
            }

            StreamChunk::ToolCallEnd {
                tool_call_id,
                input,
                ..
            } => {
                if let Some(msg) = &mut self.current_message {
                    if let Some(tc) = msg.tool_calls.get_mut(tool_call_id) {
                        if let Some(final_input) = input {
                            tc.arguments = serde_json::to_string(final_input).unwrap_or_default();
                            tc.parsed_arguments = Some(final_input.clone());
                        }
                        tc.state = ToolCallState::InputComplete;
                    }
                }
                Some(chunk)
            }

            StreamChunk::StepStarted { .. } => Some(chunk),
            StreamChunk::StepFinished {
                step_id: _step_id,
                delta,
                content,
                ..
            } => {
                if let Some(msg) = &mut self.current_message {
                    if let Some(full) = content {
                        msg.thinking_content = full.clone();
                    } else {
                        msg.thinking_content.push_str(delta);
                    }
                }
                Some(chunk)
            }

            StreamChunk::RunFinished { .. } => Some(chunk),
            StreamChunk::RunError { .. } => Some(chunk),

            // Pass through other events unchanged
            _ => Some(chunk),
        }
    }

    /// Get the final processor result after all chunks have been processed.
    pub fn result(&self) -> ProcessorResult {
        // Check current_message first (may not have been finalized), then fall back to messages
        let msg = self
            .current_message
            .as_ref()
            .or_else(|| self.messages.last());

        let content = msg
            .map(|m| m.total_text_content.clone())
            .unwrap_or_default();

        let thinking = msg
            .filter(|m| !m.thinking_content.is_empty())
            .map(|m| m.thinking_content.clone());

        let tool_calls = msg.map(|m| {
            m.tool_call_order
                .iter()
                .filter_map(|id| m.tool_calls.get(id))
                .filter(|tc| tc.state == ToolCallState::InputComplete)
                .map(|tc| ToolCall {
                    id: tc.id.clone(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: tc.name.clone(),
                        arguments: tc.arguments.clone(),
                    },
                    provider_metadata: None,
                })
                .collect()
        });

        ProcessorResult {
            content,
            thinking,
            tool_calls,
            finish_reason: None,
        }
    }

    /// Get all messages processed so far.
    pub fn messages(&self) -> &[MessageStreamState] {
        &self.messages
    }

    /// Create a recording for replay testing.
    pub fn to_recording(&self, model: Option<String>, provider: Option<String>) -> ChunkRecording {
        ChunkRecording {
            version: "1.0".to_string(),
            timestamp: chrono::Utc::now().timestamp_millis() as f64 / 1000.0,
            model,
            provider,
            chunks: self.recordings.clone(),
            result: None,
        }
    }
}

impl Default for StreamProcessor {
    fn default() -> Self {
        Self::new()
    }
}
