use serde::Deserialize;
use serde_json::{json, Value};

pub const DEFAULT_OPENAI_MODEL: &str = "gpt-4o";
pub const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Deserialize)]
pub struct RunAgentInput {
    #[serde(rename = "threadId")]
    pub thread_id: String,
    #[serde(rename = "runId")]
    pub run_id: String,
    pub messages: Vec<IncomingMessage>,
    #[serde(default)]
    #[serde(rename = "forwardedProps")]
    pub forwarded_props: Value,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct IncomingMessage {
    pub role: String,
    pub content: Option<Value>,
    pub parts: Option<Vec<MessagePart>>,
}

#[derive(Debug, Deserialize)]
pub struct MessagePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub content: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider: String,
    pub model: String,
}

pub fn provider_from_input(input: &RunAgentInput) -> ProviderConfig {
    let props = if input.forwarded_props.is_object() {
        &input.forwarded_props
    } else {
        &input.data
    };

    let provider = props
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or("openai")
        .to_string();

    let model = props
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_string);

    match provider.as_str() {
        "anthropic" => ProviderConfig {
            provider,
            model: model.unwrap_or_else(|| DEFAULT_ANTHROPIC_MODEL.to_string()),
        },
        _ => ProviderConfig {
            provider: "openai".to_string(),
            model: model.unwrap_or_else(|| DEFAULT_OPENAI_MODEL.to_string()),
        },
    }
}

pub fn sse_event(payload: Value) -> String {
    format!("data: {}\n\n", payload)
}

pub fn sse_done() -> String {
    "data: [DONE]\n\n".to_string()
}

pub fn run_started(thread_id: &str, run_id: &str) -> String {
    sse_event(json!({
        "type": "RUN_STARTED",
        "threadId": thread_id,
        "runId": run_id,
    }))
}

pub fn text_message_start(message_id: &str) -> String {
    sse_event(json!({
        "type": "TEXT_MESSAGE_START",
        "messageId": message_id,
        "role": "assistant",
    }))
}

pub fn text_message_content(message_id: &str, delta: &str) -> String {
    sse_event(json!({
        "type": "TEXT_MESSAGE_CONTENT",
        "messageId": message_id,
        "delta": delta,
    }))
}

pub fn text_message_end(message_id: &str) -> String {
    sse_event(json!({
        "type": "TEXT_MESSAGE_END",
        "messageId": message_id,
    }))
}

pub fn run_finished(thread_id: &str, run_id: &str) -> String {
    sse_event(json!({
        "type": "RUN_FINISHED",
        "threadId": thread_id,
        "runId": run_id,
        "finishReason": "stop",
    }))
}

pub fn run_error(thread_id: &str, run_id: &str, message: &str) -> String {
    sse_event(json!({
        "type": "RUN_ERROR",
        "threadId": thread_id,
        "runId": run_id,
        "error": {
            "message": message,
        },
    }))
}
