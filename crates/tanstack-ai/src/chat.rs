use std::collections::HashMap;
use std::sync::Arc;

use crate::adapter::TextAdapter;
use crate::error::AiResult;
use crate::messages::generate_message_id;
use crate::middleware::*;
use crate::tools::tool_calls::*;
use crate::types::*;

/// Options for the chat function.
pub struct ChatOptions {
    pub adapter: Arc<dyn TextAdapter>,
    pub messages: Vec<ModelMessage>,
    pub system_prompts: Vec<String>,
    pub tools: Vec<Tool>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
    pub metadata: Option<serde_json::Value>,
    pub model_options: Option<serde_json::Value>,
    pub agent_loop_strategy: Option<AgentLoopStrategy>,
    pub conversation_id: Option<String>,
    pub middleware: Vec<Box<dyn ChatMiddleware>>,
    pub stream: bool,
    pub output_schema: Option<JsonSchema>,
}

/// Result from the chat engine.
pub enum ChatResult {
    /// Collected chunks (used internally; callers get the stream directly via chat_stream).
    Chunks(Vec<StreamChunk>),
    /// Collected text content.
    Text(String),
    /// Structured output.
    Structured(serde_json::Value),
}

/// Chat with streaming - returns a Vec of all chunks after the full agentic loop completes.
///
/// This is the main entry point that handles:
/// 1. Streaming text (single or multi-iteration)
/// 2. Automatic tool execution when finish_reason is 'tool_calls'
/// 3. Agent loop with configurable strategy
/// 4. Middleware lifecycle hooks
pub async fn chat(options: ChatOptions) -> AiResult<ChatResult> {
    if options.output_schema.is_some() {
        return run_agentic_structured_output(options).await;
    }

    if !options.stream {
        return run_non_streaming_text(options).await;
    }

    run_streaming_text(options).await
}

/// Run the full agentic streaming loop, collecting all chunks.
async fn run_streaming_text(options: ChatOptions) -> AiResult<ChatResult> {
    let mut engine = TextEngine::new(options);
    let chunks = engine.run().await?;
    Ok(ChatResult::Chunks(chunks))
}

/// Run non-streaming: collect all chunks, extract text content.
async fn run_non_streaming_text(options: ChatOptions) -> AiResult<ChatResult> {
    let mut engine = TextEngine::new(options);
    let chunks = engine.run().await?;

    let mut content = String::new();
    for chunk in &chunks {
        if let StreamChunk::TextMessageContent {
            delta, content: full, ..
        } = chunk
        {
            if let Some(full_content) = full {
                content = full_content.clone();
            } else {
                content.push_str(delta);
            }
        }
    }

    Ok(ChatResult::Text(content))
}

/// Run agentic structured output:
/// 1. Execute the full agentic loop (with tools)
/// 2. Once complete, call adapter.structured_output with the conversation context
/// 3. Return the structured result
async fn run_agentic_structured_output(options: ChatOptions) -> AiResult<ChatResult> {
    let schema = options.output_schema.clone()
        .expect("run_agentic_structured_output called without output_schema");
    let adapter = options.adapter.clone();
    let model_name = adapter.model().to_string();

    // Run the agentic loop without the schema
    let mut engine = TextEngine::new(ChatOptions {
        output_schema: None,
        adapter: options.adapter.clone(),
        messages: options.messages,
        system_prompts: options.system_prompts.clone(),
        tools: options.tools,
        temperature: options.temperature,
        top_p: options.top_p,
        max_tokens: options.max_tokens,
        metadata: options.metadata,
        model_options: options.model_options.clone(),
        agent_loop_strategy: options.agent_loop_strategy,
        conversation_id: options.conversation_id,
        middleware: options.middleware,
        stream: true,
    });

    // Consume the agentic loop
    let _chunks = engine.run().await?;

    // Get final messages
    let final_messages = engine.messages.clone();
    let system_prompts = engine.system_prompts.clone();
    let temperature = engine.temperature;
    let top_p = engine.top_p;
    let max_tokens = engine.max_tokens;

    let structured_options = StructuredOutputOptions {
        chat_options: TextOptions {
            model: model_name,
            messages: final_messages,
            tools: Vec::new(),
            system_prompts,
            temperature,
            top_p,
            max_tokens,
            output_schema: Some(schema.clone()),
            ..Default::default()
        },
        output_schema: schema,
    };

    let result = adapter.structured_output(&structured_options).await?;
    Ok(ChatResult::Structured(result.data))
}

/// Core text engine with full agentic loop.
///
/// Manages:
/// - Multi-iteration streaming with tool execution
/// - Middleware lifecycle hooks
/// - Agent loop strategy
/// - Tool call accumulation and execution
pub struct TextEngine {
    adapter: Arc<dyn TextAdapter>,
    pub messages: Vec<ModelMessage>,
    pub system_prompts: Vec<String>,
    pub tools: Vec<Tool>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
    metadata: Option<serde_json::Value>,
    model_options: Option<serde_json::Value>,
    loop_strategy: AgentLoopStrategy,
    tool_call_manager: ToolCallManager,
    middleware_runner: MiddlewareRunner,
    request_id: String,
    stream_id: String,
    conversation_id: Option<String>,
    iteration_count: u32,
    last_finish_reason: Option<String>,
}

impl TextEngine {
    pub fn new(options: ChatOptions) -> Self {
        let loop_strategy = options
            .agent_loop_strategy
            .unwrap_or_else(|| max_iterations(5));

        let tool_manager = ToolCallManager::new();
        let middleware_runner = MiddlewareRunner::new(options.middleware);

        Self {
            adapter: options.adapter,
            messages: options.messages,
            system_prompts: options.system_prompts,
            tools: options.tools,
            temperature: options.temperature,
            top_p: options.top_p,
            max_tokens: options.max_tokens,
            metadata: options.metadata,
            model_options: options.model_options,
            loop_strategy,
            tool_call_manager: tool_manager,
            middleware_runner,
            request_id: generate_message_id("chat"),
            stream_id: generate_message_id("stream"),
            conversation_id: options.conversation_id,
            iteration_count: 0,
            last_finish_reason: None,
        }
    }

    /// Run the full agentic loop, returning all chunks from all iterations.
    pub async fn run(&mut self) -> AiResult<Vec<StreamChunk>> {
        let mut all_chunks = Vec::new();
        let stream_start = std::time::Instant::now();

        // Build middleware context
        let mut middleware_ctx = ChatMiddlewareContext {
            request_id: self.request_id.clone(),
            stream_id: self.stream_id.clone(),
            conversation_id: self.conversation_id.clone(),
            phase: ChatMiddlewarePhase::Init,
            iteration: 0,
            chunk_index: 0,
            context: None,
            provider: self.adapter.name().to_string(),
            model: self.adapter.model().to_string(),
            source: "server".to_string(),
            streaming: true,
            system_prompts: self.system_prompts.clone(),
            tool_names: Some(self.tools.iter().map(|t| t.name.clone()).collect()),
            options: None,
            model_options: None,
            message_count: self.messages.len(),
            has_tools: !self.tools.is_empty(),
            current_message_id: None,
            accumulated_content: String::new(),
        };

        // Run onStart middleware
        self.middleware_runner.run_on_start(&middleware_ctx);

        // Agent loop
        loop {
            // Check loop strategy
            let state = AgentLoopState {
                iteration_count: self.iteration_count,
                messages: self.messages.clone(),
                finish_reason: self.last_finish_reason.clone(),
            };

            if !(self.loop_strategy)(&state) {
                break;
            }

            // Update middleware context for this iteration
            let message_id = generate_message_id("msg");
            middleware_ctx.phase = ChatMiddlewarePhase::BeforeModel;
            middleware_ctx.iteration = self.iteration_count;
            middleware_ctx.current_message_id = Some(message_id.clone());
            middleware_ctx.accumulated_content = String::new();

            self.middleware_runner.run_on_iteration(
                &middleware_ctx,
                &IterationInfo {
                    iteration: self.iteration_count,
                    message_id: message_id.clone(),
                },
            );

            // Run onConfig middleware
            let config = self.build_middleware_config();
            let transformed = self.middleware_runner.run_on_config(&middleware_ctx, config);

            // Build text options for this iteration from middleware-transformed config
            let text_options = self.build_text_options_from_config(&transformed);

            // Stream from adapter
            middleware_ctx.phase = ChatMiddlewarePhase::ModelStream;
            let mut stream = self.adapter.chat_stream(&text_options).await?;
            let mut accumulated_content = String::new();
            let mut iteration_chunks = Vec::new();

            // Process chunks from this iteration
            use futures_util::StreamExt;
            while let Some(result) = stream.next().await {
                match result {
                    Ok(chunk) => {
                        // Run onChunk middleware
                        let output_chunks =
                            self.middleware_runner.run_on_chunk(&middleware_ctx, chunk);

                        for output_chunk in output_chunks {
                            // Track state
                            self.process_chunk(&output_chunk, &mut accumulated_content);

                            // Update middleware context
                            middleware_ctx.accumulated_content = accumulated_content.clone();
                            middleware_ctx.chunk_index += 1;

                            iteration_chunks.push(output_chunk);
                        }
                    }
                    Err(e) => {
                        let error_info = ErrorInfo {
                            error: e.to_string(),
                            duration_ms: stream_start.elapsed().as_millis(),
                        };
                        self.middleware_runner
                            .run_on_error(&middleware_ctx, &error_info);
                        return Err(e);
                    }
                }
            }

            all_chunks.extend(iteration_chunks);

            // Check if we need to execute tools
            if self.last_finish_reason.as_deref() == Some("tool_calls")
                && self.tool_call_manager.has_tool_calls()
            {
                middleware_ctx.phase = ChatMiddlewarePhase::BeforeTools;

                // Execute tools
                let tool_calls = self.tool_call_manager.tool_calls();
                let results = self.execute_tool_calls(&tool_calls).await?;

                middleware_ctx.phase = ChatMiddlewarePhase::AfterTools;

                // Build tool result chunks and update messages
                let tool_result_chunks =
                    self.build_tool_result_chunks(&results, &message_id);

                // Add assistant message with tool calls
                self.messages.push(ModelMessage {
                    role: MessageRole::Assistant,
                    content: if accumulated_content.is_empty() {
                        MessageContent::Null
                    } else {
                        MessageContent::Text(accumulated_content.clone())
                    },
                    name: None,
                    tool_calls: Some(tool_calls),
                    tool_call_id: None,
                });

                // Add tool result messages
                for result in &results {
                    let content_str = serde_json::to_string(&result.result)
                        .unwrap_or_else(|_| result.result.to_string());
                    self.messages.push(ModelMessage {
                        role: MessageRole::Tool,
                        content: MessageContent::Text(content_str),
                        name: None,
                        tool_calls: None,
                        tool_call_id: Some(result.tool_call_id.clone()),
                    });
                }

                all_chunks.extend(tool_result_chunks);

                // Clear tool call manager for next iteration
                self.tool_call_manager.clear();
                self.iteration_count += 1;
                self.last_finish_reason = None;

                // Continue the loop
                continue;
            }

            // finish_reason is 'tool_calls' but no tool calls were accumulated —
            // the model may have more to say, continue the loop
            if self.last_finish_reason.as_deref() == Some("tool_calls") {
                self.iteration_count += 1;
                self.last_finish_reason = None;
                continue;
            }

            // No tool calls or finish reason is not tool_calls — we're done
            break;
        }

        // Run onFinish middleware
        let finish_info = FinishInfo {
            finish_reason: self.last_finish_reason.clone(),
            duration_ms: stream_start.elapsed().as_millis(),
            content: accumulated_content_from_chunks(&all_chunks),
            usage: None,
        };
        self.middleware_runner
            .run_on_finish(&middleware_ctx, &finish_info);

        Ok(all_chunks)
    }

    fn build_text_options_from_config(&self, config: &ChatMiddlewareConfig) -> TextOptions {
        TextOptions {
            model: self.adapter.model().to_string(),
            messages: config.messages.clone(),
            tools: config.tools.clone(),
            system_prompts: config.system_prompts.clone(),
            temperature: config.temperature,
            top_p: config.top_p,
            max_tokens: config.max_tokens,
            metadata: config.metadata.clone(),
            model_options: config.model_options.clone(),
            output_schema: None,
            conversation_id: self.conversation_id.clone(),
            agent_loop_strategy: None,
        }
    }

    fn build_middleware_config(&self) -> ChatMiddlewareConfig {
        ChatMiddlewareConfig {
            messages: self.messages.clone(),
            system_prompts: self.system_prompts.clone(),
            tools: self.tools.clone(),
            temperature: self.temperature,
            top_p: self.top_p,
            max_tokens: self.max_tokens,
            metadata: self.metadata.clone(),
            model_options: self.model_options.clone(),
        }
    }

    /// Process a single chunk, updating internal state.
    fn process_chunk(&mut self, chunk: &StreamChunk, accumulated_content: &mut String) {
        match chunk {
            StreamChunk::TextMessageContent { delta, content, .. } => {
                if let Some(full) = content {
                    *accumulated_content = full.clone();
                } else {
                    accumulated_content.push_str(delta);
                }
            }

            StreamChunk::ToolCallStart { .. } => {
                self.tool_call_manager.add_start_event(chunk);
            }

            StreamChunk::ToolCallArgs { .. } => {
                self.tool_call_manager.add_args_event(chunk);
            }

            StreamChunk::ToolCallEnd { .. } => {
                self.tool_call_manager.complete_tool_call(chunk);
            }

            StreamChunk::RunFinished { finish_reason, .. } => {
                self.last_finish_reason = finish_reason.clone();
            }

            StreamChunk::RunError { error, .. } => {
                self.last_finish_reason = Some("error".to_string());
                eprintln!("Run error: {}", error.message);
            }

            _ => {}
        }
    }

    /// Execute all pending tool calls.
    async fn execute_tool_calls(&self, tool_calls: &[ToolCall]) -> AiResult<Vec<ToolResult>> {
        let approvals: HashMap<String, bool> = HashMap::new();
        let client_results: HashMap<String, serde_json::Value> = HashMap::new();

        let result = crate::tools::tool_calls::execute_tool_calls(
            tool_calls,
            &self.tools,
            &approvals,
            &client_results,
            None,
        )
        .await?;

        // Combine server results with error results for client tools
        let mut all_results = result.results;

        // Handle tools that need client execution (mark as error for server-side)
        for client_tool in result.needs_client_execution {
            all_results.push(ToolResult {
                tool_call_id: client_tool.tool_call_id,
                tool_name: client_tool.tool_name,
                result: serde_json::json!({"error": "Client-side tool execution not available"}),
                state: ToolResultOutputState::Error,
                duration_ms: None,
            });
        }

        // Handle tools that need approval (mark as error)
        for approval in result.needs_approval {
            all_results.push(ToolResult {
                tool_call_id: approval.tool_call_id,
                tool_name: approval.tool_name,
                result: serde_json::json!({"error": "Tool requires approval"}),
                state: ToolResultOutputState::Error,
                duration_ms: None,
            });
        }

        Ok(all_results)
    }

    /// Build TOOL_CALL_END chunks for tool results.
    fn build_tool_result_chunks(
        &self,
        results: &[ToolResult],
        _message_id: &str,
    ) -> Vec<StreamChunk> {
        let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
        let model = Some(self.adapter.model().to_string());

        results
            .iter()
            .map(|result| {
                let result_str = serde_json::to_string(&result.result).ok();
                StreamChunk::ToolCallEnd {
                    timestamp: now,
                    tool_call_id: result.tool_call_id.clone(),
                    tool_name: result.tool_name.clone(),
                    input: None,
                    result: result_str,
                    model: model.clone(),
                }
            })
            .collect()
    }

    /// Get accumulated content from the last text message.
    pub fn content(&self) -> String {
        self.messages
            .iter()
            .rev()
            .find(|m| m.role == MessageRole::Assistant)
            .and_then(|m| m.content.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default()
    }
}

/// Extract accumulated text content from all chunks.
fn accumulated_content_from_chunks(chunks: &[StreamChunk]) -> String {
    let mut content = String::new();
    for chunk in chunks {
        if let StreamChunk::TextMessageContent {
            delta, content: full, ..
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
