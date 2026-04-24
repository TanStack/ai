use crate::types::{ModelMessage, StreamChunk, Tool, ToolCall};
use std::collections::HashMap;

/// Phase of the chat middleware lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatMiddlewarePhase {
    Init,
    BeforeModel,
    ModelStream,
    BeforeTools,
    AfterTools,
}

/// Stable context object passed to all middleware hooks.
#[derive(Debug, Clone)]
pub struct ChatMiddlewareContext {
    pub request_id: String,
    pub stream_id: String,
    pub conversation_id: Option<String>,
    pub phase: ChatMiddlewarePhase,
    pub iteration: u32,
    pub chunk_index: usize,
    pub context: Option<serde_json::Value>,
    pub provider: String,
    pub model: String,
    pub source: String,
    pub streaming: bool,
    pub system_prompts: Vec<String>,
    pub tool_names: Option<Vec<String>>,
    pub options: Option<HashMap<String, serde_json::Value>>,
    pub model_options: Option<HashMap<String, serde_json::Value>>,
    pub message_count: usize,
    pub has_tools: bool,
    pub current_message_id: Option<String>,
    pub accumulated_content: String,
}

/// Chat configuration that middleware can observe or transform.
#[derive(Debug, Clone)]
pub struct ChatMiddlewareConfig {
    pub messages: Vec<ModelMessage>,
    pub system_prompts: Vec<String>,
    pub tools: Vec<Tool>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u32>,
    pub metadata: Option<serde_json::Value>,
    pub model_options: Option<serde_json::Value>,
}

/// Context provided to tool call hooks.
#[derive(Debug, Clone)]
pub struct ToolCallHookContext {
    pub tool_call: ToolCall,
    pub tool: Option<Tool>,
    pub args: serde_json::Value,
    pub tool_name: String,
    pub tool_call_id: String,
}

/// Decision from onBeforeToolCall.
#[derive(Debug, Clone)]
pub enum BeforeToolCallDecision {
    /// Continue with normal execution.
    Continue,
    /// Replace args used for execution.
    TransformArgs { args: serde_json::Value },
    /// Skip execution, use provided result.
    Skip { result: serde_json::Value },
    /// Abort the entire chat run.
    Abort { reason: Option<String> },
}

/// Outcome information provided to onAfterToolCall.
#[derive(Debug, Clone)]
pub struct AfterToolCallInfo {
    pub tool_call: ToolCall,
    pub tool_name: String,
    pub tool_call_id: String,
    pub ok: bool,
    pub duration_ms: u128,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Information passed to onIteration.
#[derive(Debug, Clone)]
pub struct IterationInfo {
    pub iteration: u32,
    pub message_id: String,
}

/// Aggregate information passed to onToolPhaseComplete.
#[derive(Debug, Clone)]
pub struct ToolPhaseCompleteInfo {
    pub tool_calls: Vec<ToolCall>,
    pub results: Vec<ToolPhaseResultInfo>,
    pub needs_approval: Vec<ToolPhaseApprovalInfo>,
    pub needs_client_execution: Vec<ToolPhaseClientInfo>,
}

#[derive(Debug, Clone)]
pub struct ToolPhaseResultInfo {
    pub tool_call_id: String,
    pub tool_name: String,
    pub result: serde_json::Value,
    pub duration_ms: Option<u128>,
}

#[derive(Debug, Clone)]
pub struct ToolPhaseApprovalInfo {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
    pub approval_id: String,
}

#[derive(Debug, Clone)]
pub struct ToolPhaseClientInfo {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
}

/// Token usage statistics.
#[derive(Debug, Clone)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Information passed to onFinish.
#[derive(Debug, Clone)]
pub struct FinishInfo {
    pub finish_reason: Option<String>,
    pub duration_ms: u128,
    pub content: String,
    pub usage: Option<UsageInfo>,
}

/// Information passed to onAbort.
#[derive(Debug, Clone)]
pub struct AbortInfo {
    pub reason: Option<String>,
    pub duration_ms: u128,
}

/// Information passed to onError.
#[derive(Debug, Clone)]
pub struct ErrorInfo {
    pub error: String,
    pub duration_ms: u128,
}

/// Chat middleware trait.
///
/// All methods have default implementations that do nothing.
/// Middleware is composed in array order.
pub trait ChatMiddleware: Send + Sync {
    /// Optional name for debugging.
    fn name(&self) -> Option<&str> {
        None
    }

    /// Called to observe or transform the chat configuration.
    fn on_config(
        &self,
        _ctx: &ChatMiddlewareContext,
        config: &ChatMiddlewareConfig,
    ) -> Option<ChatMiddlewareConfig> {
        Some(config.clone())
    }

    /// Called when the chat run starts.
    fn on_start(&self, _ctx: &ChatMiddlewareContext) {}

    /// Called at the start of each agent loop iteration.
    fn on_iteration(&self, _ctx: &ChatMiddlewareContext, _info: &IterationInfo) {}

    /// Called for every chunk yielded by the chat engine.
    /// Returns None to drop, Some(chunk) to pass through or transform.
    fn on_chunk(&self, _ctx: &ChatMiddlewareContext, chunk: StreamChunk) -> Option<StreamChunk> {
        Some(chunk)
    }

    /// Called before a tool is executed.
    fn on_before_tool_call(
        &self,
        _ctx: &ChatMiddlewareContext,
        _hook_ctx: &ToolCallHookContext,
    ) -> BeforeToolCallDecision {
        BeforeToolCallDecision::Continue
    }

    /// Called after a tool execution completes.
    fn on_after_tool_call(&self, _ctx: &ChatMiddlewareContext, _info: &AfterToolCallInfo) {}

    /// Called after all tool calls in an iteration have been processed.
    fn on_tool_phase_complete(&self, _ctx: &ChatMiddlewareContext, _info: &ToolPhaseCompleteInfo) {}

    /// Called when usage data is available.
    fn on_usage(&self, _ctx: &ChatMiddlewareContext, _usage: &UsageInfo) {}

    /// Called when the chat run completes normally.
    fn on_finish(&self, _ctx: &ChatMiddlewareContext, _info: &FinishInfo) {}

    /// Called when the chat run is aborted.
    fn on_abort(&self, _ctx: &ChatMiddlewareContext, _info: &AbortInfo) {}

    /// Called when the chat run encounters an unhandled error.
    fn on_error(&self, _ctx: &ChatMiddlewareContext, _info: &ErrorInfo) {}
}

/// Middleware runner that composes multiple middlewares.
pub struct MiddlewareRunner {
    middlewares: Vec<Box<dyn ChatMiddleware>>,
}

impl MiddlewareRunner {
    pub fn new(middlewares: Vec<Box<dyn ChatMiddleware>>) -> Self {
        Self { middlewares }
    }

    /// Run on_config through all middlewares in order.
    pub fn run_on_config(
        &self,
        ctx: &ChatMiddlewareContext,
        config: ChatMiddlewareConfig,
    ) -> ChatMiddlewareConfig {
        let mut current = config;
        for mw in &self.middlewares {
            if let Some(transformed) = mw.on_config(ctx, &current) {
                current = transformed;
            }
        }
        current
    }

    /// Run on_start through all middlewares.
    pub fn run_on_start(&self, ctx: &ChatMiddlewareContext) {
        for mw in &self.middlewares {
            mw.on_start(ctx);
        }
    }

    /// Run on_iteration through all middlewares.
    pub fn run_on_iteration(&self, ctx: &ChatMiddlewareContext, info: &IterationInfo) {
        for mw in &self.middlewares {
            mw.on_iteration(ctx, info);
        }
    }

    /// Run on_chunk through all middlewares in order.
    /// Each middleware can observe, transform, expand, or drop chunks.
    pub fn run_on_chunk(
        &self,
        ctx: &ChatMiddlewareContext,
        chunk: StreamChunk,
    ) -> Vec<StreamChunk> {
        let mut chunks = vec![chunk];
        for mw in &self.middlewares {
            let mut next_chunks = Vec::new();
            for c in chunks {
                if let Some(output) = mw.on_chunk(ctx, c) {
                    next_chunks.push(output);
                }
            }
            chunks = next_chunks;
        }
        chunks
    }

    /// Run on_before_tool_call through middlewares.
    pub fn run_on_before_tool_call(
        &self,
        ctx: &ChatMiddlewareContext,
        hook_ctx: &ToolCallHookContext,
    ) -> BeforeToolCallDecision {
        for mw in &self.middlewares {
            match mw.on_before_tool_call(ctx, hook_ctx) {
                BeforeToolCallDecision::Continue => {}
                decision => return decision,
            }
        }
        BeforeToolCallDecision::Continue
    }

    /// Run on_after_tool_call through all middlewares.
    pub fn run_on_after_tool_call(&self, ctx: &ChatMiddlewareContext, info: &AfterToolCallInfo) {
        for mw in &self.middlewares {
            mw.on_after_tool_call(ctx, info);
        }
    }

    /// Run on_tool_phase_complete through all middlewares.
    pub fn run_on_tool_phase_complete(
        &self,
        ctx: &ChatMiddlewareContext,
        info: &ToolPhaseCompleteInfo,
    ) {
        for mw in &self.middlewares {
            mw.on_tool_phase_complete(ctx, info);
        }
    }

    /// Run on_usage through all middlewares.
    pub fn run_on_usage(&self, ctx: &ChatMiddlewareContext, usage: &UsageInfo) {
        for mw in &self.middlewares {
            mw.on_usage(ctx, usage);
        }
    }

    /// Run on_finish through all middlewares.
    pub fn run_on_finish(&self, ctx: &ChatMiddlewareContext, info: &FinishInfo) {
        for mw in &self.middlewares {
            mw.on_finish(ctx, info);
        }
    }

    /// Run on_abort through all middlewares.
    pub fn run_on_abort(&self, ctx: &ChatMiddlewareContext, info: &AbortInfo) {
        for mw in &self.middlewares {
            mw.on_abort(ctx, info);
        }
    }

    /// Run on_error through all middlewares.
    pub fn run_on_error(&self, ctx: &ChatMiddlewareContext, info: &ErrorInfo) {
        for mw in &self.middlewares {
            mw.on_error(ctx, info);
        }
    }
}

impl Default for MiddlewareRunner {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}
