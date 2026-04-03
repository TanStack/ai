use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;

use crate::adapter::{
    build_http_client, send_with_retries, ChunkStream, TextAdapter, TextAdapterConfig,
};
use crate::error::{AiError, AiResult};
use crate::types::*;

/// Anthropic Claude text adapter.
///
/// Uses the Anthropic Messages API with streaming to produce AG-UI protocol events.
pub struct AnthropicTextAdapter {
    api_key: String,
    model: String,
    base_url: String,
    client: Client,
    max_retries: u32,
}

impl AnthropicTextAdapter {
    /// Create a new Anthropic adapter.
    pub fn new(model: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: "https://api.anthropic.com".to_string(),
            client: Client::new(),
            max_retries: 0,
        }
    }

    /// Create with custom configuration.
    pub fn with_config(
        model: impl Into<String>,
        api_key: impl Into<String>,
        config: TextAdapterConfig,
    ) -> Self {
        let api_key = config.api_key.clone().unwrap_or_else(|| api_key.into());
        let mut adapter = Self::new(model, api_key);
        adapter.client = build_http_client(&config);
        adapter.max_retries = config.max_retries.unwrap_or(0);
        if let Some(base_url) = config.base_url {
            adapter.base_url = base_url;
        }
        adapter
    }

    fn build_request_body(&self, options: &TextOptions, stream: bool) -> serde_json::Value {
        let mut body = serde_json::Map::new();

        body.insert("model".to_string(), serde_json::json!(self.model));
        body.insert("stream".to_string(), serde_json::json!(stream));

        // System prompts
        if !options.system_prompts.is_empty() {
            let system = options.system_prompts.join("\n");
            body.insert("system".to_string(), serde_json::json!(system));
        }

        // Messages
        let messages: Vec<serde_json::Value> = options
            .messages
            .iter()
            .filter(|m| m.role != MessageRole::System)
            .map(|msg| {
                let mut m = serde_json::Map::new();
                // Anthropic uses "user" for tool result messages
                let role_str = if msg.role == MessageRole::Tool {
                    "user"
                } else {
                    msg.role.as_str()
                };
                m.insert("role".to_string(), serde_json::json!(role_str));

                if msg.role == MessageRole::Tool {
                    let tool_result_text = match &msg.content {
                        MessageContent::Text(text) => text.clone(),
                        MessageContent::Null | MessageContent::Parts(_) => String::new(),
                    };
                    m.insert(
                        "content".to_string(),
                        serde_json::json!([{
                            "type": "tool_result",
                            "tool_use_id": msg.tool_call_id,
                            "content": tool_result_text
                        }]),
                    );
                    return serde_json::Value::Object(m);
                }

                match &msg.content {
                    MessageContent::Text(text) => {
                        m.insert("content".to_string(), serde_json::json!(text));
                    }
                    MessageContent::Parts(parts) => {
                        let content: Vec<serde_json::Value> = parts
                            .iter()
                            .map(|part| match part {
                                ContentPart::Text { content } => {
                                    serde_json::json!({"type": "text", "text": content})
                                }
                                ContentPart::Image { source } => match source {
                                    ContentPartSource::Data { value, mime_type } => {
                                        serde_json::json!({
                                            "type": "image",
                                            "source": {
                                                "type": "base64",
                                                "media_type": mime_type,
                                                "data": value
                                            }
                                        })
                                    }
                                    ContentPartSource::Url { value, .. } => {
                                        serde_json::json!({
                                            "type": "image",
                                            "source": {
                                                "type": "url",
                                                "url": value
                                            }
                                        })
                                    }
                                },
                                _ => serde_json::json!({"type": "text", "text": ""}),
                            })
                            .collect();
                        m.insert("content".to_string(), serde_json::json!(content));
                    }
                    MessageContent::Null => {
                        if let Some(tool_calls) = &msg.tool_calls {
                            let content: Vec<serde_json::Value> = tool_calls
                                .iter()
                                .map(|tc| {
                                    serde_json::json!({
                                        "type": "tool_use",
                                        "id": tc.id,
                                        "name": tc.function.name,
                                        "input": serde_json::from_str::<serde_json::Value>(
                                            &tc.function.arguments
                                        ).unwrap_or(serde_json::json!({}))
                                    })
                                })
                                .collect();
                            m.insert("content".to_string(), serde_json::json!(content));
                        } else if msg.role == MessageRole::Tool {
                            m.insert(
                                "content".to_string(),
                                serde_json::json!([{
                                    "type": "tool_result",
                                    "tool_use_id": msg.tool_call_id,
                                    "content": msg.content.as_str().unwrap_or("")
                                }]),
                            );
                        } else {
                            m.insert("content".to_string(), serde_json::json!(""));
                        }
                    }
                }

                serde_json::Value::Object(m)
            })
            .collect();

        body.insert("messages".to_string(), serde_json::json!(messages));

        // Tools (Anthropic format)
        if !options.tools.is_empty() {
            let tools: Vec<serde_json::Value> = options
                .tools
                .iter()
                .map(|t| {
                    let mut tool = serde_json::Map::new();
                    tool.insert("name".to_string(), serde_json::json!(t.name));
                    tool.insert("description".to_string(), serde_json::json!(t.description));
                    if let Some(schema) = &t.input_schema {
                        tool.insert(
                            "input_schema".to_string(),
                            serde_json::to_value(schema).unwrap_or(serde_json::json!({})),
                        );
                    }
                    serde_json::Value::Object(tool)
                })
                .collect();
            body.insert("tools".to_string(), serde_json::json!(tools));
        }

        if let Some(temp) = options.temperature {
            body.insert("temperature".to_string(), serde_json::json!(temp));
        }
        if let Some(top_p) = options.top_p {
            body.insert("top_p".to_string(), serde_json::json!(top_p));
        }
        if let Some(max_tokens) = options.max_tokens {
            body.insert("max_tokens".to_string(), serde_json::json!(max_tokens));
        }

        serde_json::Value::Object(body)
    }
}

// Anthropic SSE event types
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: AnthropicMessage },
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: usize,
        content_block: AnthropicContentBlock,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { index: usize, delta: AnthropicDelta },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop { index: usize },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: AnthropicMessageDelta,
        usage: Option<AnthropicUsage>,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "error")]
    Error { error: AnthropicError },
    #[serde(other)]
    Unknown,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct AnthropicMessage {
    id: String,
    #[serde(rename = "type")]
    msg_type: String,
    role: String,
    content: Vec<serde_json::Value>,
    model: String,
    stop_reason: Option<String>,
    usage: Option<AnthropicUsage>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(other)]
    Unknown,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
    #[serde(other)]
    Unknown,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct AnthropicMessageDelta {
    stop_reason: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct AnthropicError {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

#[async_trait]
impl TextAdapter for AnthropicTextAdapter {
    fn name(&self) -> &str {
        "anthropic"
    }

    fn model(&self) -> &str {
        &self.model
    }

    async fn chat_stream(&self, options: &TextOptions) -> AiResult<ChunkStream> {
        let body = self.build_request_body(options, true);
        let url = format!("{}/v1/messages", self.base_url);

        let response = send_with_retries(
            self.client
                .post(&url)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&body),
            self.max_retries,
        )
        .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "Anthropic API error ({}): {}",
                status, text
            )));
        }

        let model = self.model.clone();
        let byte_stream = response.bytes_stream();

        let chunk_stream = parse_anthropic_sse_stream(byte_stream, model);
        Ok(Box::pin(chunk_stream))
    }

    async fn structured_output(
        &self,
        options: &StructuredOutputOptions,
    ) -> AiResult<StructuredOutputResult> {
        let mut body = self.build_request_body(&options.chat_options, false);

        // Add tool for structured output
        if let Some(obj) = body.as_object_mut() {
            obj.insert(
                "tools".to_string(),
                serde_json::json!([{
                    "name": "structured_output",
                    "description": "Return structured output",
                    "input_schema": options.output_schema
                }]),
            );
            obj.insert(
                "tool_choice".to_string(),
                serde_json::json!({"type": "tool", "name": "structured_output"}),
            );
        }

        let url = format!("{}/v1/messages", self.base_url);

        let response = send_with_retries(
            self.client
                .post(&url)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&body),
            self.max_retries,
        )
        .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "Anthropic API error ({}): {}",
                status, text
            )));
        }

        let response_data: serde_json::Value = response.json().await?;

        // Extract tool use input
        if let Some(content) = response_data.get("content").and_then(|c| c.as_array()) {
            for block in content {
                if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    if let Some(input) = block.get("input") {
                        return Ok(StructuredOutputResult {
                            data: input.clone(),
                            raw_text: serde_json::to_string(input).unwrap_or_default(),
                        });
                    }
                }
            }
        }

        Err(AiError::Provider(
            "No structured output in Anthropic response".to_string(),
        ))
    }
}

fn parse_anthropic_sse_stream<S>(
    stream: S,
    model: String,
) -> impl Stream<Item = AiResult<StreamChunk>>
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send,
{
    use futures_util::StreamExt;

    let stream = Box::pin(stream);
    futures_util::stream::unfold(
        (stream, String::new(), HashMap::<usize, String>::new()),
        move |(mut stream, mut line_buf, mut tool_block_ids)| {
            let model = model.clone();
            async move {
                loop {
                    match stream.next().await {
                        Some(Ok(bytes)) => {
                            let text = String::from_utf8_lossy(&bytes);
                            line_buf.push_str(&text);

                            let mut chunks: Vec<AiResult<StreamChunk>> = Vec::new();
                            let mut processed_to = 0;

                            while let Some(newline_pos) = line_buf[processed_to..].find('\n') {
                                let abs_pos = processed_to + newline_pos;
                                let line = line_buf[processed_to..abs_pos].trim();
                                processed_to = abs_pos + 1;

                                if line.is_empty() || line.starts_with(':') {
                                    continue;
                                }

                                if let Some(data_str) = line.strip_prefix("data: ") {
                                    match serde_json::from_str::<AnthropicEvent>(data_str) {
                                        Ok(event) => {
                                            let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
                                            let model_str = Some(model.clone());

                                            match event {
                                                AnthropicEvent::ContentBlockStart { index, content_block } => {
                                                    match content_block {
                                                        AnthropicContentBlock::Text { .. } => {
                                                            chunks.push(Ok(StreamChunk::TextMessageStart {
                                                                timestamp: now,
                                                                message_id: format!("block-{}", index),
                                                                role: "assistant".to_string(),
                                                                model: model_str,
                                                            }));
                                                        }
                                                        AnthropicContentBlock::ToolUse { id, name, .. } => {
                                                            tool_block_ids.insert(index, id.clone());
                                                            chunks.push(Ok(StreamChunk::ToolCallStart {
                                                                timestamp: now,
                                                                tool_call_id: id,
                                                                tool_name: name,
                                                                parent_message_id: None,
                                                                index: Some(index),
                                                                provider_metadata: None,
                                                                model: model_str,
                                                            }));
                                                        }
                                                        _ => {}
                                                    }
                                                }
                                                AnthropicEvent::ContentBlockDelta { index, delta } => {
                                                    match delta {
                                                        AnthropicDelta::TextDelta { text } => {
                                                            chunks.push(Ok(StreamChunk::TextMessageContent {
                                                                timestamp: now,
                                                                message_id: format!("block-{}", index),
                                                                delta: text,
                                                                content: None,
                                                                model: model_str,
                                                            }));
                                                        }
                                                        AnthropicDelta::InputJsonDelta { partial_json } => {
                                                            if let Some(tool_call_id) = tool_block_ids.get(&index).cloned() {
                                                                chunks.push(Ok(StreamChunk::ToolCallArgs {
                                                                    timestamp: now,
                                                                    tool_call_id,
                                                                    delta: partial_json,
                                                                    args: None,
                                                                    model: model_str,
                                                                }));
                                                            } else {
                                                                tracing::warn!(index, "missing anthropic tool_use id for input_json_delta");
                                                            }
                                                        }
                                                        _ => {}
                                                    }
                                                }
                                                other => {
                                                    for chunk in convert_anthropic_event(other, &model) {
                                                        chunks.push(Ok(chunk));
                                                    }
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                error = %e,
                                                data = %&data_str[..data_str.len().min(200)],
                                                "failed to parse anthropic event"
                                            );
                                        }
                                    }
                                }
                            }

                            line_buf = line_buf[processed_to..].to_string();

                            if !chunks.is_empty() {
                                return Some((
                                    futures_util::stream::iter(chunks),
                                    (stream, line_buf, tool_block_ids),
                                ));
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                futures_util::stream::iter(vec![Err(AiError::Http(e))]),
                                (stream, line_buf, tool_block_ids),
                            ));
                        }
                        None => {
                            let line = line_buf.trim();
                            if line.is_empty() {
                                return None;
                            }

                            if let Some(data_str) = line.strip_prefix("data: ") {
                                match serde_json::from_str::<AnthropicEvent>(data_str) {
                                    Ok(event) => {
                                        let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
                                        let model_str = Some(model.clone());
                                        let mut chunks: Vec<AiResult<StreamChunk>> = Vec::new();

                                        match event {
                                            AnthropicEvent::ContentBlockStart { index, content_block } => {
                                                match content_block {
                                                    AnthropicContentBlock::Text { .. } => {
                                                        chunks.push(Ok(StreamChunk::TextMessageStart {
                                                            timestamp: now,
                                                            message_id: format!("block-{}", index),
                                                            role: "assistant".to_string(),
                                                            model: model_str,
                                                        }));
                                                    }
                                                    AnthropicContentBlock::ToolUse { id, name, .. } => {
                                                        tool_block_ids.insert(index, id.clone());
                                                        chunks.push(Ok(StreamChunk::ToolCallStart {
                                                            timestamp: now,
                                                            tool_call_id: id,
                                                            tool_name: name,
                                                            parent_message_id: None,
                                                            index: Some(index),
                                                            provider_metadata: None,
                                                            model: model_str,
                                                        }));
                                                    }
                                                    _ => {}
                                                }
                                            }
                                            AnthropicEvent::ContentBlockDelta { index, delta } => {
                                                match delta {
                                                    AnthropicDelta::TextDelta { text } => {
                                                        chunks.push(Ok(StreamChunk::TextMessageContent {
                                                            timestamp: now,
                                                            message_id: format!("block-{}", index),
                                                            delta: text,
                                                            content: None,
                                                            model: model_str,
                                                        }));
                                                    }
                                                    AnthropicDelta::InputJsonDelta { partial_json } => {
                                                        if let Some(tool_call_id) = tool_block_ids.get(&index).cloned() {
                                                            chunks.push(Ok(StreamChunk::ToolCallArgs {
                                                                timestamp: now,
                                                                tool_call_id,
                                                                delta: partial_json,
                                                                args: None,
                                                                model: model_str,
                                                            }));
                                                        } else {
                                                            tracing::warn!(index, "missing anthropic tool_use id for input_json_delta");
                                                        }
                                                    }
                                                    _ => {}
                                                }
                                            }
                                            other => {
                                                for chunk in convert_anthropic_event(other, &model) {
                                                    chunks.push(Ok(chunk));
                                                }
                                            }
                                        }

                                        return Some((
                                            futures_util::stream::iter(chunks),
                                            (stream, String::new(), tool_block_ids),
                                        ));
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            error = %e,
                                            data = %&data_str[..data_str.len().min(200)],
                                            "failed to parse anthropic event"
                                        );
                                    }
                                }
                            }

                            return None;
                        }
                    }
                }
            }
        },
    )
    .flatten()
}

fn convert_anthropic_event(event: AnthropicEvent, model: &str) -> Vec<StreamChunk> {
    let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
    let model_str = Some(model.to_string());

    match event {
        AnthropicEvent::MessageStart { message } => {
            vec![StreamChunk::RunStarted {
                timestamp: now,
                run_id: message.id,
                thread_id: None,
                model: model_str,
            }]
        }

        AnthropicEvent::ContentBlockDelta { index, delta } => match delta {
            AnthropicDelta::TextDelta { text } => {
                vec![StreamChunk::TextMessageContent {
                    timestamp: now,
                    message_id: format!("block-{}", index),
                    delta: text,
                    content: None,
                    model: model_str,
                }]
            }
            AnthropicDelta::InputJsonDelta { .. } => vec![],
            _ => vec![],
        },

        AnthropicEvent::MessageDelta { delta, usage } => {
            let mut chunks = vec![];

            if let Some(reason) = delta.stop_reason {
                let finish_reason = match reason.as_str() {
                    "end_turn" => "stop".to_string(),
                    "max_tokens" => "length".to_string(),
                    "tool_use" => "tool_calls".to_string(),
                    _ => reason,
                };

                let u = usage.map(|u| Usage {
                    prompt_tokens: u.input_tokens,
                    completion_tokens: u.output_tokens,
                    total_tokens: u.input_tokens + u.output_tokens,
                });

                chunks.push(StreamChunk::RunFinished {
                    timestamp: now,
                    run_id: format!("anthropic-{}", chrono::Utc::now().timestamp_millis()),
                    finish_reason: Some(finish_reason),
                    usage: u,
                    model: model_str,
                });
            }

            chunks
        }

        AnthropicEvent::Error { error } => {
            vec![StreamChunk::RunError {
                timestamp: now,
                run_id: None,
                error: RunErrorData {
                    message: error.message,
                    code: Some(error.error_type),
                },
                model: model_str,
            }]
        }

        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn parse_anthropic_maps_index_to_tool_use_id() {
        let start = serde_json::json!({
            "type": "content_block_start",
            "index": 0,
            "content_block": {
                "type": "tool_use",
                "id": "toolu_123",
                "name": "get_weather",
                "input": {}
            }
        })
        .to_string();

        let delta = serde_json::json!({
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "input_json_delta",
                "partial_json": "{\"city\":\"SF\"}"
            }
        })
        .to_string();

        let sse = format!("data: {}\ndata: {}", start, delta);
        let stream = futures_util::stream::iter(vec![Ok(Bytes::from(sse))]);

        let chunks = parse_anthropic_sse_stream(stream, "claude-3-5-sonnet".to_string())
            .collect::<Vec<_>>()
            .await;

        assert_eq!(chunks.len(), 2);

        match &chunks[0] {
            Ok(StreamChunk::ToolCallStart { tool_call_id, .. }) => {
                assert_eq!(tool_call_id, "toolu_123")
            }
            other => panic!("unexpected chunk 0: {other:?}"),
        }

        match &chunks[1] {
            Ok(StreamChunk::ToolCallArgs { tool_call_id, .. }) => {
                assert_eq!(tool_call_id, "toolu_123")
            }
            other => panic!("unexpected chunk 1: {other:?}"),
        }
    }
}
