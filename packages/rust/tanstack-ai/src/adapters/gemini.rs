use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde::Deserialize;

use crate::adapter::{ChunkStream, TextAdapter, TextAdapterConfig};
use crate::error::{AiError, AiResult};
use crate::types::*;

/// Google Gemini text adapter.
///
/// Uses the Gemini Generate Content API with streaming to produce AG-UI protocol events.
pub struct GeminiTextAdapter {
    api_key: String,
    model: String,
    base_url: String,
    client: Client,
}

impl GeminiTextAdapter {
    /// Create a new Gemini adapter.
    pub fn new(model: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
            client: Client::new(),
        }
    }

    /// Create with custom configuration.
    pub fn with_config(
        model: impl Into<String>,
        api_key: impl Into<String>,
        config: TextAdapterConfig,
    ) -> Self {
        let mut adapter = Self::new(model, api_key);
        if let Some(base_url) = config.base_url {
            adapter.base_url = base_url;
        }
        adapter
    }

    fn build_request_body(
        &self,
        options: &TextOptions,
    ) -> serde_json::Value {
        let mut body = serde_json::Map::new();

        // Contents (messages)
        let mut contents = Vec::new();

        // System instruction
        if !options.system_prompts.is_empty() {
            body.insert(
                "system_instruction".to_string(),
                serde_json::json!({
                    "parts": options.system_prompts.iter().map(|p| {
                        serde_json::json!({"text": p})
                    }).collect::<Vec<_>>()
                }),
            );
        }

        for msg in &options.messages {
            if msg.role == MessageRole::System {
                continue;
            }

            if msg.role == MessageRole::Tool {
                let tool_result_text = match &msg.content {
                    MessageContent::Text(text) => text.clone(),
                    MessageContent::Null | MessageContent::Parts(_) => String::new(),
                };
                contents.push(serde_json::json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": msg.tool_call_id.as_deref().unwrap_or(""),
                            "response": {
                                "result": tool_result_text
                            }
                        }
                    }]
                }));
                continue;
            }

            let role = match msg.role {
                MessageRole::User | MessageRole::Tool => "user",
                MessageRole::Assistant => "model",
                MessageRole::System => continue,
            };

            let parts = match &msg.content {
                MessageContent::Text(text) => {
                    vec![serde_json::json!({"text": text})]
                }
                MessageContent::Parts(ps) => {
                    ps.iter()
                        .map(|part| match part {
                            ContentPart::Text { content } => {
                                serde_json::json!({"text": content})
                            }
                            ContentPart::Image { source } => match source {
                                ContentPartSource::Data { value, mime_type } => {
                                    serde_json::json!({
                                        "inlineData": {
                                            "mimeType": mime_type,
                                            "data": value
                                        }
                                    })
                                }
                                ContentPartSource::Url { value, .. } => {
                                    serde_json::json!({"text": format!("[Image: {}]", value)})
                                }
                            },
                            _ => serde_json::json!({"text": ""}),
                        })
                        .collect()
                }
                MessageContent::Null => {
                    vec![serde_json::json!({"text": ""})]
                }
            };

            contents.push(serde_json::json!({
                "role": role,
                "parts": parts
            }));
        }

        body.insert("contents".to_string(), serde_json::json!(contents));

        // Tools
        if !options.tools.is_empty() {
            let function_declarations: Vec<serde_json::Value> = options
                .tools
                .iter()
                .map(|t| {
                    let mut func = serde_json::Map::new();
                    func.insert("name".to_string(), serde_json::json!(t.name));
                    func.insert("description".to_string(), serde_json::json!(t.description));
                    if let Some(schema) = &t.input_schema {
                        func.insert(
                            "parameters".to_string(),
                            serde_json::to_value(schema).unwrap_or(serde_json::json!({})),
                        );
                    }
                    serde_json::Value::Object(func)
                })
                .collect();

            body.insert(
                "tools".to_string(),
                serde_json::json!([{"function_declarations": function_declarations}]),
            );
        }

        // Generation config
        let mut gen_config = serde_json::Map::new();
        if let Some(temp) = options.temperature {
            gen_config.insert("temperature".to_string(), serde_json::json!(temp));
        }
        if let Some(top_p) = options.top_p {
            gen_config.insert("topP".to_string(), serde_json::json!(top_p));
        }
        if let Some(max_tokens) = options.max_tokens {
            gen_config.insert("maxOutputTokens".to_string(), serde_json::json!(max_tokens));
        }

        if !gen_config.is_empty() {
            body.insert(
                "generationConfig".to_string(),
                serde_json::Value::Object(gen_config),
            );
        }

        serde_json::Value::Object(body)
    }
}

// Gemini SSE event types
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    usage_metadata: Option<GeminiUsage>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
    finish_reason: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiContent {
    parts: Option<Vec<GeminiPart>>,
    role: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    FunctionCall { function_call: GeminiFunctionCall },
    FunctionResponse { function_response: GeminiFunctionResponse },
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiFunctionResponse {
    name: String,
    response: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct GeminiUsage {
    prompt_token_count: Option<u32>,
    candidates_token_count: Option<u32>,
    total_token_count: Option<u32>,
}

#[async_trait]
impl TextAdapter for GeminiTextAdapter {
    fn name(&self) -> &str {
        "gemini"
    }

    fn model(&self) -> &str {
        &self.model
    }

    async fn chat_stream(&self, options: &TextOptions) -> AiResult<ChunkStream> {
        let body = self.build_request_body(options);
        let url = format!(
            "{}/models/{}:streamGenerateContent?key={}&alt=sse",
            self.base_url, self.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "Gemini API error ({}): {}",
                status, text
            )));
        }

        let model = self.model.clone();
        let byte_stream = response.bytes_stream();

        let chunk_stream = parse_gemini_sse_stream(byte_stream, model);
        Ok(Box::pin(chunk_stream))
    }

    async fn structured_output(
        &self,
        options: &StructuredOutputOptions,
    ) -> AiResult<StructuredOutputResult> {
        let mut body = self.build_request_body(&options.chat_options);

        // Add response schema
        if let Some(obj) = body.as_object_mut() {
            obj.insert(
                "generationConfig".to_string(),
                serde_json::json!({
                    "response_mime_type": "application/json",
                    "response_schema": options.output_schema
                }),
            );
        }

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url, self.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!(
                "Gemini API error ({}): {}",
                status, text
            )));
        }

        let response_data: GeminiResponse = response.json().await?;

        let text = response_data
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts)
            .and_then(|p| p.into_iter().next())
            .and_then(|p| match p {
                GeminiPart::Text { text } => Some(text),
                _ => None,
            })
            .unwrap_or_default();

        let data: serde_json::Value = serde_json::from_str(&text)?;

        Ok(StructuredOutputResult {
            data,
            raw_text: text,
        })
    }
}

fn parse_gemini_sse_stream<S>(
    stream: S,
    model: String,
) -> impl Stream<Item = AiResult<StreamChunk>>
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send,
{
    use futures_util::StreamExt;

    let stream = Box::pin(stream);
    futures_util::stream::unfold(
        (stream, String::new()),
        move |(mut stream, mut line_buf)| {
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
                                    match serde_json::from_str::<GeminiResponse>(data_str) {
                                        Ok(response) => {
                                            for chunk in convert_gemini_response(response, &model) {
                                                chunks.push(Ok(chunk));
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!(
                                                "Failed to parse Gemini event: {} - {}",
                                                e,
                                                &data_str[..data_str.len().min(200)]
                                            );
                                        }
                                    }
                                }
                            }

                            line_buf = line_buf[processed_to..].to_string();

                            if !chunks.is_empty() {
                                return Some((futures_util::stream::iter(chunks), (stream, line_buf)));
                            }
                        }
                        Some(Err(e)) => {
                            return Some((
                                futures_util::stream::iter(vec![Err(AiError::Http(e))]),
                                (stream, line_buf),
                            ));
                        }
                        None => return None,
                    }
                }
            }
        },
    )
    .flatten()
}

fn convert_gemini_response(response: GeminiResponse, model: &str) -> Vec<StreamChunk> {
    let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
    let model_str = Some(model.to_string());
    let mut chunks = vec![];

    if let Some(candidates) = response.candidates {
        for (i, candidate) in candidates.iter().enumerate() {
            if let Some(content) = &candidate.content {
                if let Some(parts) = &content.parts {
                    for part in parts {
                        match part {
                            GeminiPart::Text { text } => {
                                chunks.push(StreamChunk::TextMessageContent {
                                    timestamp: now,
                                    message_id: format!("gemini-{}", i),
                                    delta: text.clone(),
                                    content: None,
                                    model: model_str.clone(),
                                });
                            }
                            GeminiPart::FunctionCall { function_call } => {
                                chunks.push(StreamChunk::ToolCallStart {
                                    timestamp: now,
                                    tool_call_id: format!("gemini-tool-{}", i),
                                    tool_name: function_call.name.clone(),
                                    parent_message_id: None,
                                    index: Some(i),
                                    provider_metadata: None,
                                    model: model_str.clone(),
                                });

                                if let Some(args) = &function_call.args {
                                    chunks.push(StreamChunk::ToolCallEnd {
                                        timestamp: now,
                                        tool_call_id: format!("gemini-tool-{}", i),
                                        tool_name: function_call.name.clone(),
                                        input: Some(args.clone()),
                                        result: None,
                                        model: model_str.clone(),
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }

            if let Some(finish_reason) = &candidate.finish_reason {
                let reason = match finish_reason.as_str() {
                    "STOP" => "stop",
                    "MAX_TOKENS" => "length",
                    "SAFETY" => "content_filter",
                    "TOOL_CALL" => "tool_calls",
                    _ => finish_reason.as_str(),
                };

                let usage = response.usage_metadata.as_ref().map(|u| Usage {
                    prompt_tokens: u.prompt_token_count.unwrap_or(0),
                    completion_tokens: u.candidates_token_count.unwrap_or(0),
                    total_tokens: u.total_token_count.unwrap_or(0),
                });

                chunks.push(StreamChunk::RunFinished {
                    timestamp: now,
                    run_id: format!("gemini-{}", chrono::Utc::now().timestamp_millis()),
                    finish_reason: Some(reason.to_string()),
                    usage,
                    model: model_str.clone(),
                });
            }
        }
    }

    chunks
}
