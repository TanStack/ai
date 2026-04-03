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

/// OpenAI text adapter.
///
/// Uses the OpenAI Responses API with streaming to produce AG-UI protocol events.
pub struct OpenAiTextAdapter {
    api_key: String,
    model: String,
    base_url: String,
    client: Client,
    max_retries: u32,
}

impl OpenAiTextAdapter {
    /// Create a new OpenAI adapter with an explicit API key.
    pub fn new(model: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: "https://api.openai.com/v1".to_string(),
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

    fn tool_calls_json(tool_calls: &[ToolCall]) -> Vec<serde_json::Value> {
        tool_calls
            .iter()
            .map(|tc| {
                serde_json::json!({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                })
            })
            .collect()
    }

    /// Build the request body for the OpenAI Responses API.
    fn build_request_body(&self, options: &TextOptions, stream: bool) -> serde_json::Value {
        let mut body = serde_json::Map::new();

        body.insert("model".to_string(), serde_json::json!(self.model));
        body.insert("stream".to_string(), serde_json::json!(stream));

        // Convert messages to OpenAI format
        let input = self.convert_messages(&options.messages, &options.system_prompts);
        body.insert("input".to_string(), input);

        // Tools
        if !options.tools.is_empty() {
            let tools: Vec<serde_json::Value> = options
                .tools
                .iter()
                .map(|t| {
                    let mut tool = serde_json::Map::new();
                    tool.insert("type".to_string(), serde_json::json!("function"));
                    tool.insert("name".to_string(), serde_json::json!(t.name));
                    tool.insert("description".to_string(), serde_json::json!(t.description));
                    if let Some(schema) = &t.input_schema {
                        tool.insert(
                            "parameters".to_string(),
                            serde_json::to_value(schema).unwrap_or(serde_json::json!({})),
                        );
                    }
                    serde_json::Value::Object(tool)
                })
                .collect();
            body.insert("tools".to_string(), serde_json::json!(tools));
        }

        // Optional parameters
        if let Some(temp) = options.temperature {
            body.insert("temperature".to_string(), serde_json::json!(temp));
        }
        if let Some(top_p) = options.top_p {
            body.insert("top_p".to_string(), serde_json::json!(top_p));
        }
        if let Some(max_tokens) = options.max_tokens {
            body.insert(
                "max_output_tokens".to_string(),
                serde_json::json!(max_tokens),
            );
        }

        serde_json::Value::Object(body)
    }

    /// Convert ModelMessages to OpenAI Responses API input format.
    fn convert_messages(
        &self,
        messages: &[ModelMessage],
        system_prompts: &[String],
    ) -> serde_json::Value {
        let mut items = Vec::new();

        // System prompts
        for prompt in system_prompts {
            items.push(serde_json::json!({
                "role": "system",
                "content": prompt
            }));
        }

        for msg in messages {
            if msg.role == MessageRole::Tool {
                let content = match &msg.content {
                    MessageContent::Text(text) => text.clone(),
                    MessageContent::Null => String::new(),
                    MessageContent::Parts(_) => String::new(),
                };
                items.push(serde_json::json!({
                    "type": "function_call_output",
                    "call_id": msg.tool_call_id,
                    "output": content
                }));
                continue;
            }

            match &msg.content {
                MessageContent::Text(text) => {
                    let mut item = serde_json::Map::new();
                    item.insert("role".to_string(), serde_json::json!(msg.role.as_str()));
                    item.insert("content".to_string(), serde_json::json!(text));
                    if let Some(tool_calls) = &msg.tool_calls {
                        item.insert(
                            "tool_calls".to_string(),
                            serde_json::json!(Self::tool_calls_json(tool_calls)),
                        );
                    }
                    items.push(serde_json::Value::Object(item));
                }
                MessageContent::Parts(parts) => {
                    let mut content = Vec::new();
                    for part in parts {
                        match part {
                            ContentPart::Text { content: text } => {
                                content.push(serde_json::json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            ContentPart::Image { source } => {
                                let url = match source {
                                    ContentPartSource::Url { value, .. } => value.clone(),
                                    ContentPartSource::Data {
                                        value, mime_type, ..
                                    } => {
                                        format!("data:{};base64,{}", mime_type, value)
                                    }
                                };
                                content.push(serde_json::json!({
                                    "type": "image_url",
                                    "image_url": { "url": url }
                                }));
                            }
                            _ => {}
                        }
                    }
                    let mut item = serde_json::Map::new();
                    item.insert("role".to_string(), serde_json::json!(msg.role.as_str()));
                    item.insert("content".to_string(), serde_json::json!(content));
                    if let Some(tool_calls) = &msg.tool_calls {
                        item.insert(
                            "tool_calls".to_string(),
                            serde_json::json!(Self::tool_calls_json(tool_calls)),
                        );
                    }
                    items.push(serde_json::Value::Object(item));
                }
                MessageContent::Null => {
                    // Handle tool calls in assistant messages
                    if let Some(tool_calls) = &msg.tool_calls {
                        items.push(serde_json::json!({
                            "role": "assistant",
                            "tool_calls": Self::tool_calls_json(tool_calls)
                        }));
                    }
                }
            }
        }

        serde_json::json!(items)
    }
}

// ============================================================================
// OpenAI SSE Event Types (deserialization structs - fields needed for serde)
// ============================================================================

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum OpenAiStreamEvent {
    #[serde(rename = "response.created")]
    ResponseCreated { response: OpenAiResponse },
    #[serde(rename = "response.output_item.added")]
    OutputItemAdded {
        #[serde(default)]
        output_index: usize,
        item: OpenAiOutputItem,
    },
    #[serde(rename = "response.content_part.added")]
    ContentPartAdded {
        item_id: String,
        #[serde(default)]
        output_index: usize,
        #[serde(default)]
        content_index: usize,
        part: OpenAiContentPart,
    },
    #[serde(rename = "response.output_text.delta")]
    OutputTextDelta {
        item_id: String,
        #[serde(default)]
        output_index: usize,
        #[serde(default)]
        content_index: usize,
        delta: String,
    },
    #[serde(rename = "response.output_text.done")]
    OutputTextDone {
        item_id: String,
        #[serde(default)]
        output_index: usize,
        #[serde(default)]
        content_index: usize,
        text: String,
    },
    #[serde(rename = "response.function_call_arguments.delta")]
    FunctionCallArgumentsDelta {
        item_id: String,
        #[serde(default)]
        output_index: usize,
        #[serde(default)]
        content_index: usize,
        delta: String,
    },
    #[serde(rename = "response.function_call_arguments.done")]
    FunctionCallArgumentsDone {
        item_id: String,
        #[serde(default)]
        output_index: usize,
        #[serde(default)]
        content_index: usize,
        arguments: String,
    },
    #[serde(rename = "response.completed")]
    ResponseCompleted { response: OpenAiResponse },
    #[serde(rename = "error")]
    Error { code: String, message: String },
    #[serde(other)]
    Unknown,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    id: String,
    status: Option<String>,
    usage: Option<OpenAiUsage>,
    #[serde(flatten)]
    _extra: std::collections::HashMap<String, serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct OpenAiUsage {
    input_tokens: u32,
    output_tokens: u32,
    total_tokens: u32,
    #[serde(flatten)]
    _extra: std::collections::HashMap<String, serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum OpenAiOutputItem {
    #[serde(rename = "message")]
    Message {
        id: String,
        role: String,
        status: Option<String>,
    },
    #[serde(rename = "function_call")]
    FunctionCall {
        id: String,
        name: String,
        arguments: String,
        status: Option<String>,
        call_id: String,
    },
    #[serde(other)]
    Unknown,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum OpenAiContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(other)]
    Unknown,
}

// ============================================================================
// Adapter Implementation
// ============================================================================

#[async_trait]
impl TextAdapter for OpenAiTextAdapter {
    fn name(&self) -> &str {
        "openai"
    }

    fn model(&self) -> &str {
        &self.model
    }

    async fn chat_stream(&self, options: &TextOptions) -> AiResult<ChunkStream> {
        let body = self.build_request_body(options, true);
        let url = format!("{}/responses", self.base_url);

        let response = send_with_retries(
            self.client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Content-Type", "application/json")
                .json(&body),
            self.max_retries,
        )
        .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "OpenAI API error ({}): {}",
                status, text
            )));
        }

        let model = self.model.clone();
        let byte_stream = response.bytes_stream();

        // Convert SSE byte stream to StreamChunk stream
        let chunk_stream = parse_openai_sse_stream(byte_stream, model);

        Ok(Box::pin(chunk_stream))
    }

    async fn structured_output(
        &self,
        options: &StructuredOutputOptions,
    ) -> AiResult<StructuredOutputResult> {
        let mut body = self.build_request_body(&options.chat_options, false);

        // Add structured output format
        if let Some(obj) = body.as_object_mut() {
            obj.insert(
                "text".to_string(),
                serde_json::json!({
                    "format": {
                        "type": "json_schema",
                        "name": "structured_output",
                        "schema": options.output_schema,
                        "strict": true
                    }
                }),
            );
        }

        let url = format!("{}/responses", self.base_url);

        let response = send_with_retries(
            self.client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Content-Type", "application/json")
                .json(&body),
            self.max_retries,
        )
        .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "OpenAI API error ({}): {}",
                status, text
            )));
        }

        let response_data: serde_json::Value = response.json().await?;

        // Extract text content from response
        let text = extract_text_from_response(&response_data);
        let data: serde_json::Value = serde_json::from_str(&text)?;

        Ok(StructuredOutputResult {
            data,
            raw_text: text,
        })
    }
}

/// Parse OpenAI SSE stream into StreamChunk events.
///
/// Uses an unfolding state machine to buffer incomplete SSE lines
/// across HTTP response chunks.
fn parse_openai_sse_stream<S>(stream: S, model: String) -> impl Stream<Item = AiResult<StreamChunk>>
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send,
{
    use futures_util::StreamExt;

    let stream = Box::pin(stream);
    futures_util::stream::unfold(
        (
            stream,
            String::new(),
            HashMap::<String, String>::new(),
            HashMap::<String, String>::new(),
            false,
        ),
        move |(
            mut stream,
            mut line_buf,
            mut item_to_call,
            mut item_to_tool,
            mut has_tool_calls,
        )| {
            let model = model.clone();
            async move {
                loop {
                    match stream.next().await {
                        Some(Ok(bytes)) => {
                            let text = String::from_utf8_lossy(&bytes);
                            line_buf.push_str(&text);

                            let mut chunks: Vec<AiResult<StreamChunk>> = Vec::new();
                            let mut processed_to = 0;

                            // Process complete lines (delimited by \n)
                            while let Some(newline_pos) = line_buf[processed_to..].find('\n') {
                                let abs_pos = processed_to + newline_pos;
                                let line = line_buf[processed_to..abs_pos].trim();
                                processed_to = abs_pos + 1;

                                if line.is_empty() || line.starts_with(':') {
                                    continue;
                                }

                                if let Some(data_str) = line.strip_prefix("data: ") {
                                    if data_str == "[DONE]" {
                                        continue;
                                    }

                                    match serde_json::from_str::<OpenAiStreamEvent>(data_str) {
                                        Ok(event) => {
                                            let now = chrono::Utc::now().timestamp_millis() as f64
                                                / 1000.0;
                                            let model_str = Some(model.clone());

                                            match event {
                                                OpenAiStreamEvent::OutputItemAdded {
                                                    item, ..
                                                } => match item {
                                                    OpenAiOutputItem::Message {
                                                        id, role, ..
                                                    } => {
                                                        chunks.push(Ok(
                                                            StreamChunk::TextMessageStart {
                                                                timestamp: now,
                                                                message_id: id,
                                                                role,
                                                                model: model_str,
                                                            },
                                                        ));
                                                    }
                                                    OpenAiOutputItem::FunctionCall {
                                                        id,
                                                        name,
                                                        call_id,
                                                        ..
                                                    } => {
                                                        has_tool_calls = true;
                                                        item_to_call
                                                            .insert(id.clone(), call_id.clone());
                                                        item_to_tool
                                                            .insert(id.clone(), name.clone());
                                                        chunks.push(Ok(
                                                            StreamChunk::ToolCallStart {
                                                                timestamp: now,
                                                                tool_call_id: call_id,
                                                                tool_name: name,
                                                                parent_message_id: Some(id),
                                                                index: None,
                                                                provider_metadata: None,
                                                                model: model_str,
                                                            },
                                                        ));
                                                    }
                                                    _ => {}
                                                },
                                                OpenAiStreamEvent::FunctionCallArgumentsDelta {
                                                    item_id,
                                                    delta,
                                                    ..
                                                } => {
                                                    let tool_call_id = item_to_call
                                                        .get(&item_id)
                                                        .cloned()
                                                        .unwrap_or(item_id);
                                                    chunks.push(Ok(StreamChunk::ToolCallArgs {
                                                        timestamp: now,
                                                        tool_call_id,
                                                        delta,
                                                        args: None,
                                                        model: model_str,
                                                    }));
                                                }
                                                OpenAiStreamEvent::FunctionCallArgumentsDone {
                                                    item_id,
                                                    arguments,
                                                    ..
                                                } => {
                                                    let tool_call_id = item_to_call
                                                        .get(&item_id)
                                                        .cloned()
                                                        .unwrap_or(item_id.clone());
                                                    let tool_name = item_to_tool
                                                        .get(&item_id)
                                                        .cloned()
                                                        .unwrap_or_default();
                                                    let input: Option<serde_json::Value> =
                                                        serde_json::from_str(&arguments).ok();
                                                    chunks.push(Ok(StreamChunk::ToolCallEnd {
                                                        timestamp: now,
                                                        tool_call_id,
                                                        tool_name,
                                                        input,
                                                        result: None,
                                                        model: model_str,
                                                    }));
                                                }
                                                other => {
                                                    for chunk in convert_openai_event(
                                                        other,
                                                        &model,
                                                        has_tool_calls,
                                                    ) {
                                                        chunks.push(Ok(chunk));
                                                    }
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                error = %e,
                                                data = %&data_str[..data_str.len().min(200)],
                                                "failed to parse openai event"
                                            );
                                        }
                                    }
                                }
                            }

                            // Keep incomplete trailing data in buffer
                            line_buf = line_buf[processed_to..].to_string();

                            if !chunks.is_empty() {
                                return Some((
                                    futures_util::stream::iter(chunks),
                                    (stream, line_buf, item_to_call, item_to_tool, has_tool_calls),
                                ));
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                futures_util::stream::iter(vec![Err(AiError::Http(e))]),
                                (stream, line_buf, item_to_call, item_to_tool, has_tool_calls),
                            ));
                        }
                        None => {
                            let line = line_buf.trim();
                            if line.is_empty() {
                                return None;
                            }

                            if let Some(data_str) = line.strip_prefix("data: ") {
                                if data_str == "[DONE]" {
                                    return None;
                                }

                                match serde_json::from_str::<OpenAiStreamEvent>(data_str) {
                                    Ok(event) => {
                                        let now =
                                            chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
                                        let model_str = Some(model.clone());
                                        let mut chunks: Vec<AiResult<StreamChunk>> = Vec::new();

                                        match event {
                                            OpenAiStreamEvent::OutputItemAdded { item, .. } => {
                                                match item {
                                                    OpenAiOutputItem::Message {
                                                        id, role, ..
                                                    } => {
                                                        chunks.push(Ok(
                                                            StreamChunk::TextMessageStart {
                                                                timestamp: now,
                                                                message_id: id,
                                                                role,
                                                                model: model_str,
                                                            },
                                                        ));
                                                    }
                                                    OpenAiOutputItem::FunctionCall {
                                                        id,
                                                        name,
                                                        call_id,
                                                        ..
                                                    } => {
                                                        has_tool_calls = true;
                                                        item_to_call
                                                            .insert(id.clone(), call_id.clone());
                                                        item_to_tool
                                                            .insert(id.clone(), name.clone());
                                                        chunks.push(Ok(
                                                            StreamChunk::ToolCallStart {
                                                                timestamp: now,
                                                                tool_call_id: call_id,
                                                                tool_name: name,
                                                                parent_message_id: Some(id),
                                                                index: None,
                                                                provider_metadata: None,
                                                                model: model_str,
                                                            },
                                                        ));
                                                    }
                                                    _ => {}
                                                }
                                            }
                                            OpenAiStreamEvent::FunctionCallArgumentsDelta {
                                                item_id,
                                                delta,
                                                ..
                                            } => {
                                                let tool_call_id = item_to_call
                                                    .get(&item_id)
                                                    .cloned()
                                                    .unwrap_or(item_id);
                                                chunks.push(Ok(StreamChunk::ToolCallArgs {
                                                    timestamp: now,
                                                    tool_call_id,
                                                    delta,
                                                    args: None,
                                                    model: model_str,
                                                }));
                                            }
                                            OpenAiStreamEvent::FunctionCallArgumentsDone {
                                                item_id,
                                                arguments,
                                                ..
                                            } => {
                                                let tool_call_id = item_to_call
                                                    .get(&item_id)
                                                    .cloned()
                                                    .unwrap_or(item_id.clone());
                                                let tool_name = item_to_tool
                                                    .get(&item_id)
                                                    .cloned()
                                                    .unwrap_or_default();
                                                let input: Option<serde_json::Value> =
                                                    serde_json::from_str(&arguments).ok();
                                                chunks.push(Ok(StreamChunk::ToolCallEnd {
                                                    timestamp: now,
                                                    tool_call_id,
                                                    tool_name,
                                                    input,
                                                    result: None,
                                                    model: model_str,
                                                }));
                                            }
                                            other => {
                                                for chunk in convert_openai_event(
                                                    other,
                                                    &model,
                                                    has_tool_calls,
                                                ) {
                                                    chunks.push(Ok(chunk));
                                                }
                                            }
                                        }

                                        return Some((
                                            futures_util::stream::iter(chunks),
                                            (
                                                stream,
                                                String::new(),
                                                item_to_call,
                                                item_to_tool,
                                                has_tool_calls,
                                            ),
                                        ));
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            error = %e,
                                            data = %&data_str[..data_str.len().min(200)],
                                            "failed to parse openai event"
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

/// Convert an OpenAI SSE event to one or more StreamChunks.
fn convert_openai_event(
    event: OpenAiStreamEvent,
    model: &str,
    has_tool_calls: bool,
) -> Vec<StreamChunk> {
    let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
    let model_str = Some(model.to_string());

    match event {
        OpenAiStreamEvent::ResponseCreated { response } => {
            vec![StreamChunk::RunStarted {
                timestamp: now,
                run_id: response.id,
                thread_id: None,
                model: model_str,
            }]
        }

        OpenAiStreamEvent::OutputItemAdded { item, .. } => match item {
            OpenAiOutputItem::Message { id, role, .. } => {
                vec![StreamChunk::TextMessageStart {
                    timestamp: now,
                    message_id: id,
                    role,
                    model: model_str,
                }]
            }
            OpenAiOutputItem::FunctionCall {
                id, name, call_id, ..
            } => {
                vec![StreamChunk::ToolCallStart {
                    timestamp: now,
                    tool_call_id: call_id.clone(),
                    tool_name: name,
                    parent_message_id: Some(id),
                    index: None,
                    provider_metadata: None,
                    model: model_str,
                }]
            }
            _ => vec![],
        },

        OpenAiStreamEvent::OutputTextDelta { item_id, delta, .. } => {
            vec![StreamChunk::TextMessageContent {
                timestamp: now,
                message_id: item_id,
                delta,
                content: None,
                model: model_str,
            }]
        }

        OpenAiStreamEvent::OutputTextDone { item_id, text, .. } => {
            vec![StreamChunk::TextMessageContent {
                timestamp: now,
                message_id: item_id,
                delta: String::new(),
                content: Some(text),
                model: model_str.clone(),
            }]
        }

        OpenAiStreamEvent::FunctionCallArgumentsDelta { item_id, delta, .. } => {
            vec![StreamChunk::ToolCallArgs {
                timestamp: now,
                tool_call_id: item_id,
                delta,
                args: None,
                model: model_str,
            }]
        }

        OpenAiStreamEvent::FunctionCallArgumentsDone {
            item_id, arguments, ..
        } => {
            let input: Option<serde_json::Value> = serde_json::from_str(&arguments).ok();
            vec![StreamChunk::ToolCallEnd {
                timestamp: now,
                tool_call_id: item_id,
                tool_name: String::new(),
                input,
                result: None,
                model: model_str,
            }]
        }

        OpenAiStreamEvent::ResponseCompleted { response } => {
            let mut chunks = vec![];

            // Emit text message end if we had text
            // (This is a simplification — in production we'd track state)

            let finish_reason = if has_tool_calls {
                Some("tool_calls".to_string())
            } else {
                response.status.as_deref().map(|s| match s {
                    "completed" => "stop".to_string(),
                    "failed" => "error".to_string(),
                    _ => s.to_string(),
                })
            };

            let usage = response.usage.map(|u| Usage {
                prompt_tokens: u.input_tokens,
                completion_tokens: u.output_tokens,
                total_tokens: u.total_tokens,
            });

            chunks.push(StreamChunk::RunFinished {
                timestamp: now,
                run_id: response.id,
                finish_reason,
                usage,
                model: model_str,
            });

            chunks
        }

        OpenAiStreamEvent::Error { code, message } => {
            vec![StreamChunk::RunError {
                timestamp: now,
                run_id: None,
                error: RunErrorData {
                    message,
                    code: Some(code),
                },
                model: model_str,
            }]
        }

        OpenAiStreamEvent::Unknown => vec![],
        OpenAiStreamEvent::ContentPartAdded { .. } => vec![],
    }
}

/// Extract text content from an OpenAI response object.
fn extract_text_from_response(response: &serde_json::Value) -> String {
    // Try output array (Responses API format)
    if let Some(output) = response.get("output").and_then(|o| o.as_array()) {
        for item in output {
            if let Some(content) = item.get("content").and_then(|c| c.as_array()) {
                for part in content {
                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        return text.to_string();
                    }
                }
            }
        }
    }

    // Try output_text direct field
    if let Some(text) = response.get("output_text").and_then(|t| t.as_str()) {
        return text.to_string();
    }

    // Try choices (Chat Completions API format)
    if let Some(choices) = response.get("choices").and_then(|c| c.as_array()) {
        if let Some(first) = choices.first() {
            if let Some(message) = first.get("message") {
                if let Some(text) = message.get("content").and_then(|c| c.as_str()) {
                    return text.to_string();
                }
            }
        }
    }

    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn parse_openai_maps_item_id_to_call_id_across_events() {
        let start = serde_json::json!({
            "type": "response.output_item.added",
            "item": {
                "type": "function_call",
                "id": "item_1",
                "name": "get_weather",
                "arguments": "",
                "status": "in_progress",
                "call_id": "call_abc"
            }
        })
        .to_string();

        let delta = serde_json::json!({
            "type": "response.function_call_arguments.delta",
            "item_id": "item_1",
            "delta": "{\"city\":\"San"
        })
        .to_string();

        let done = serde_json::json!({
            "type": "response.function_call_arguments.done",
            "item_id": "item_1",
            "arguments": "{\"city\":\"San Francisco\"}"
        })
        .to_string();

        let sse_1 = format!("data: {}\ndata: {}\n", start, delta);
        let sse_2 = format!("data: {}", done);

        let stream =
            futures_util::stream::iter(vec![Ok(Bytes::from(sse_1)), Ok(Bytes::from(sse_2))]);

        let chunks = parse_openai_sse_stream(stream, "gpt-4o".to_string())
            .collect::<Vec<_>>()
            .await;

        assert_eq!(chunks.len(), 3);

        match &chunks[0] {
            Ok(StreamChunk::ToolCallStart { tool_call_id, .. }) => {
                assert_eq!(tool_call_id, "call_abc")
            }
            other => panic!("unexpected chunk 0: {other:?}"),
        }

        match &chunks[1] {
            Ok(StreamChunk::ToolCallArgs { tool_call_id, .. }) => {
                assert_eq!(tool_call_id, "call_abc")
            }
            other => panic!("unexpected chunk 1: {other:?}"),
        }

        match &chunks[2] {
            Ok(StreamChunk::ToolCallEnd {
                tool_call_id,
                tool_name,
                ..
            }) => {
                assert_eq!(tool_call_id, "call_abc");
                assert_eq!(tool_name, "get_weather");
            }
            other => panic!("unexpected chunk 2: {other:?}"),
        }
    }

    #[test]
    fn convert_messages_serializes_tool_results_for_responses_api() {
        let adapter = OpenAiTextAdapter::new("gpt-4.1", "test-key");
        let messages = vec![ModelMessage {
            role: MessageRole::Tool,
            content: MessageContent::Text("{\"temp\":72}".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: Some("call_123".to_string()),
        }];

        let converted = adapter.convert_messages(&messages, &[]);
        assert_eq!(
            converted,
            serde_json::json!([
                {
                    "type": "function_call_output",
                    "call_id": "call_123",
                    "output": "{\"temp\":72}"
                }
            ])
        );
    }
}
