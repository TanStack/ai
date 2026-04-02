use bytes::Bytes;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client;
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::error::{AiError, AiResult};
use crate::stream::StreamProcessor;
use crate::types::*;

/// Connection type for the chat client.
pub enum ConnectionAdapter {
    /// Server-Sent Events via fetch.
    ServerSentEvents { url: String, headers: HashMap<String, String> },
    /// HTTP streaming.
    HttpStream { url: String, headers: HashMap<String, String> },
    /// Custom stream provider.
    Custom {
        provider: Box<dyn Fn(Vec<ModelMessage>) -> Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>> + Send + Sync>,
    },
}

/// Subscription handle for chat client events.
pub type SubscriptionId = u64;

/// Chat state that clients can subscribe to.
#[derive(Debug, Clone)]
pub struct ChatState {
    pub messages: Vec<UiMessage>,
    pub is_loading: bool,
    pub error: Option<String>,
    pub accumulated_content: String,
}

impl Default for ChatState {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            is_loading: false,
            error: None,
            accumulated_content: String::new(),
        }
    }
}

/// Headless chat client with framework-agnostic state management.
///
/// Supports connection adapters (SSE, HTTP stream, custom) and
/// provides subscription-based architecture for real-time updates.
pub struct ChatClient {
    state: Arc<RwLock<ChatState>>,
    connection: ConnectionAdapter,
    processor: Arc<Mutex<StreamProcessor>>,
    next_subscription_id: Arc<Mutex<SubscriptionId>>,
    subscribers: Arc<RwLock<HashMap<SubscriptionId, broadcast::Sender<ChatState>>>>,
    client: Client,
}

impl ChatClient {
    /// Create a new chat client with a connection adapter.
    pub fn new(connection: ConnectionAdapter) -> Self {
        Self {
            state: Arc::new(RwLock::new(ChatState::default())),
            connection,
            processor: Arc::new(Mutex::new(StreamProcessor::new())),
            next_subscription_id: Arc::new(Mutex::new(0)),
            subscribers: Arc::new(RwLock::new(HashMap::new())),
            client: Client::new(),
        }
    }

    /// Subscribe to state changes. Returns a broadcast receiver.
    pub async fn subscribe(&self) -> broadcast::Receiver<ChatState> {
        let mut id_guard = self.next_subscription_id.lock().await;
        *id_guard += 1;

        let (tx, rx) = broadcast::channel(100);
        self.subscribers.write().await.insert(*id_guard, tx);

        rx
    }

    /// Get the current state snapshot.
    pub async fn get_state(&self) -> ChatState {
        self.state.read().await.clone()
    }

    /// Send a message and stream the response.
    pub async fn send(&self, content: impl Into<String>) -> AiResult<()> {
        let user_content = content.into();

        // Add user message
        {
            let mut state = self.state.write().await;
            state.messages.push(UiMessage {
                id: generate_message_id("msg"),
                role: UiMessageRole::User,
                parts: vec![MessagePart::Text {
                    content: user_content.clone(),
                    metadata: None,
                }],
                created_at: Some(chrono::Utc::now()),
            });
            state.is_loading = true;
            state.error = None;
        }

        self.notify_subscribers().await;

        // Build messages for the provider
        let messages = {
            let state = self.state.read().await;
            crate::messages::ui_messages_to_model_messages(&state.messages)
        };

        // Stream the response
        match &self.connection {
            ConnectionAdapter::ServerSentEvents { url, headers } => {
                self.stream_via_sse(url, headers, messages).await
            }
            ConnectionAdapter::HttpStream { url, headers } => {
                self.stream_via_http(url, headers, messages).await
            }
            ConnectionAdapter::Custom { provider } => {
                let mut stream = provider(messages);
                self.process_stream(&mut stream).await
            }
        }
    }

    /// Stop the current generation.
    pub async fn stop(&self) {
        let mut state = self.state.write().await;
        state.is_loading = false;
        self.notify_subscribers().await;
    }

    /// Clear all messages.
    pub async fn clear(&self) {
        let mut state = self.state.write().await;
        state.messages.clear();
        state.accumulated_content.clear();
        state.error = None;
        self.notify_subscribers().await;
    }

    async fn stream_via_sse(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        messages: Vec<ModelMessage>,
    ) -> AiResult<()> {
        let body = serde_json::json!({ "messages": messages });

        let mut request = self.client.post(url).json(&body);
        for (key, value) in headers {
            request = request.header(key.as_str(), value.as_str());
        }

        let response = request.send().await?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let mut state = self.state.write().await;
            state.is_loading = false;
            state.error = Some(format!("HTTP {}: {}", status, text));
            self.notify_subscribers().await;
            return Err(AiError::Provider(format!("HTTP {}: {}", status, text)));
        }

        let byte_stream = response.bytes_stream();

        // Parse SSE events from byte stream
        let chunk_stream = parse_sse_to_chunks(byte_stream);
        futures_util::pin_mut!(chunk_stream);

        self.process_stream(&mut chunk_stream).await
    }

    async fn stream_via_http(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        messages: Vec<ModelMessage>,
    ) -> AiResult<()> {
        let body = serde_json::json!({ "messages": messages });

        let mut request = self.client.post(url).json(&body);
        for (key, value) in headers {
            request = request.header(key.as_str(), value.as_str());
        }

        let response = request.send().await?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::Provider(format!("HTTP {}: {}", status, text)));
        }

        let byte_stream = response.bytes_stream();

        // Parse NDJSON events
        let chunk_stream = parse_ndjson_to_chunks(byte_stream);
        futures_util::pin_mut!(chunk_stream);

        self.process_stream(&mut chunk_stream).await
    }

    async fn process_stream(&self, stream: &mut Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>) -> AiResult<()>
    {
        let mut processor = self.processor.lock().await;

        while let Some(result) = stream.next().await {
            match result {
                Ok(chunk) => {
                    if let Some(processed) = processor.process_chunk(chunk) {
                        self.apply_chunk(&processed).await;
                    }
                }
                Err(e) => {
                    let mut state = self.state.write().await;
                    state.is_loading = false;
                    state.error = Some(e.to_string());
                    self.notify_subscribers().await;
                    return Err(e);
                }
            }
        }

        let mut state = self.state.write().await;
        state.is_loading = false;
        self.notify_subscribers().await;

        Ok(())
    }

    async fn apply_chunk(&self, chunk: &StreamChunk) {
        let mut state = self.state.write().await;

        match chunk {
            StreamChunk::TextMessageContent { delta, content, .. } => {
                if let Some(full) = content {
                    state.accumulated_content = full.clone();
                } else {
                    state.accumulated_content.push_str(delta);
                }

                // Update or create the assistant message
                let new_content = state.accumulated_content.clone();
                if let Some(last) = state.messages.last_mut() {
                    if last.role == UiMessageRole::Assistant {
                        if let Some(MessagePart::Text { content, .. }) = last.parts.last_mut() {
                            *content = new_content;
                        }
                    }
                }
            }

            StreamChunk::TextMessageStart { role, .. } => {
                let ui_role = match role.as_str() {
                    "system" => UiMessageRole::System,
                    "assistant" => UiMessageRole::Assistant,
                    _ => UiMessageRole::Assistant,
                };
                state.messages.push(UiMessage {
                    id: generate_message_id("msg"),
                    role: ui_role,
                    parts: vec![MessagePart::Text {
                        content: String::new(),
                        metadata: None,
                    }],
                    created_at: Some(chrono::Utc::now()),
                });
            }

            StreamChunk::ToolCallStart { tool_call_id, tool_name, .. } => {
                if let Some(last) = state.messages.last_mut() {
                    if last.role == UiMessageRole::Assistant {
                        last.parts.push(MessagePart::ToolCall {
                            id: tool_call_id.clone(),
                            name: tool_name.clone(),
                            arguments: String::new(),
                            state: ToolCallState::AwaitingInput,
                            approval: None,
                            output: None,
                        });
                    }
                }
            }

            StreamChunk::ToolCallArgs { tool_call_id, delta, .. } => {
                if let Some(last) = state.messages.last_mut() {
                    for part in &mut last.parts {
                        if let MessagePart::ToolCall { id, arguments, state: tc_state, .. } = part {
                            if id == tool_call_id {
                                arguments.push_str(delta);
                                *tc_state = ToolCallState::InputStreaming;
                                break;
                            }
                        }
                    }
                }
            }

            StreamChunk::ToolCallEnd { tool_call_id, input, result, .. } => {
                if let Some(last) = state.messages.last_mut() {
                    for part in &mut last.parts {
                        if let MessagePart::ToolCall { id, state: tc_state, arguments, output, .. } = part {
                            if id == tool_call_id {
                                *tc_state = ToolCallState::InputComplete;
                                if let Some(input_val) = input {
                                    *arguments = serde_json::to_string(input_val).unwrap_or_default();
                                }
                                if let Some(result_str) = result {
                                    *output = serde_json::from_str(result_str).ok();
                                }
                                break;
                            }
                        }
                    }
                }
            }

            StreamChunk::RunError { error, .. } => {
                state.is_loading = false;
                state.error = Some(error.message.clone());
            }

            _ => {}
        }

        self.notify_subscribers().await;
    }

    async fn notify_subscribers(&self) {
        let state = self.state.read().await;
        let subscribers = self.subscribers.read().await;

        // Remove closed subscribers
        let mut to_remove = Vec::new();
        for (id, tx) in subscribers.iter() {
            if tx.send(state.clone()).is_err() {
                to_remove.push(*id);
            }
        }

        if !to_remove.is_empty() {
            drop(subscribers);
            let mut subs = self.subscribers.write().await;
            for id in to_remove {
                subs.remove(&id);
            }
        }
    }
}

/// Generate a unique message ID.
fn generate_message_id(prefix: &str) -> String {
    format!(
        "{}-{}-{}",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        &uuid::Uuid::new_v4().to_string()[..8]
    )
}

/// Parse SSE byte stream into StreamChunk events.
fn parse_sse_to_chunks<S>(
    stream: S,
) -> Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    use futures_util::StreamExt;

    futures_util::stream::unfold(
        (Box::pin(stream), String::new()),
        |(mut stream, mut line_buf)| async move {
            loop {
                match stream.next().await {
                    Some(Ok(bytes)) => {
                        let text = String::from_utf8_lossy(&bytes);
                        line_buf.push_str(&text);

                        let mut chunks = Vec::new();
                        let mut processed_to = 0;

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
                                match serde_json::from_str::<StreamChunk>(data_str) {
                                    Ok(chunk) => chunks.push(Ok(chunk)),
                                    Err(e) => {
                                        chunks.push(Err(AiError::Stream(format!(
                                            "Failed to parse SSE chunk: {}",
                                            e
                                        ))));
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
                    None => {
                        let line = line_buf.trim();
                        if line.is_empty() {
                            return None;
                        }

                        if let Some(data_str) = line.strip_prefix("data: ") {
                            if data_str == "[DONE]" {
                                return None;
                            }
                            let parsed = serde_json::from_str::<StreamChunk>(data_str)
                                .map_err(|e| {
                                    AiError::Stream(format!("Failed to parse SSE chunk: {}", e))
                                });
                            return Some((futures_util::stream::iter(vec![parsed]), (stream, String::new())));
                        }

                        return Some((
                            futures_util::stream::iter(vec![Err(AiError::Stream(
                                "Failed to parse SSE chunk: missing data prefix".to_string(),
                            ))]),
                            (stream, String::new()),
                        ));
                    }
                }
            }
        },
    )
    .flatten()
    .boxed()
}

/// Parse NDJSON byte stream into StreamChunk events.
fn parse_ndjson_to_chunks<S>(
    stream: S,
) -> Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    use futures_util::StreamExt;

    futures_util::stream::unfold(
        (Box::pin(stream), String::new()),
        |(mut stream, mut line_buf)| async move {
            loop {
                match stream.next().await {
                    Some(Ok(bytes)) => {
                        let text = String::from_utf8_lossy(&bytes);
                        line_buf.push_str(&text);

                        let mut chunks = Vec::new();
                        let mut processed_to = 0;

                        while let Some(newline_pos) = line_buf[processed_to..].find('\n') {
                            let abs_pos = processed_to + newline_pos;
                            let line = line_buf[processed_to..abs_pos].trim();
                            processed_to = abs_pos + 1;

                            if line.is_empty() {
                                continue;
                            }

                            match serde_json::from_str::<StreamChunk>(line) {
                                Ok(chunk) => chunks.push(Ok(chunk)),
                                Err(e) => {
                                    chunks.push(Err(AiError::Stream(format!(
                                        "Failed to parse NDJSON chunk: {}",
                                        e
                                    ))));
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
                    None => {
                        let line = line_buf.trim();
                        if line.is_empty() {
                            return None;
                        }

                        let parsed = serde_json::from_str::<StreamChunk>(line)
                            .map_err(|e| AiError::Stream(format!("Failed to parse NDJSON chunk: {}", e)));
                        return Some((futures_util::stream::iter(vec![parsed]), (stream, String::new())));
                    }
                }
            }
        },
    )
    .flatten()
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn parse_sse_handles_final_line_without_newline() {
        let json = serde_json::to_string(&StreamChunk::RunStarted {
            timestamp: 1.0,
            run_id: "run_1".to_string(),
            thread_id: None,
            model: Some("test-model".to_string()),
        })
        .expect("serialize stream chunk");

        let sse = format!("data: {}", json);
        let stream = futures_util::stream::iter(vec![Ok(Bytes::from(sse))]);

        let parsed = parse_sse_to_chunks(stream).collect::<Vec<_>>().await;
        assert_eq!(parsed.len(), 1);

        match &parsed[0] {
            Ok(StreamChunk::RunStarted { run_id, .. }) => assert_eq!(run_id, "run_1"),
            other => panic!("unexpected parsed chunk: {other:?}"),
        }
    }

    #[tokio::test]
    async fn parse_ndjson_handles_split_final_line_without_newline() {
        let json = serde_json::to_string(&StreamChunk::RunFinished {
            timestamp: 2.0,
            run_id: "run_2".to_string(),
            finish_reason: Some("stop".to_string()),
            usage: None,
            model: Some("test-model".to_string()),
        })
        .expect("serialize stream chunk");

        let split = json.len() / 2;
        let stream = futures_util::stream::iter(vec![
            Ok(Bytes::from(json[..split].to_string())),
            Ok(Bytes::from(json[split..].to_string())),
        ]);

        let parsed = parse_ndjson_to_chunks(stream).collect::<Vec<_>>().await;
        assert_eq!(parsed.len(), 1);

        match &parsed[0] {
            Ok(StreamChunk::RunFinished { run_id, finish_reason, .. }) => {
                assert_eq!(run_id, "run_2");
                assert_eq!(finish_reason.as_deref(), Some("stop"));
            }
            other => panic!("unexpected parsed chunk: {other:?}"),
        }
    }
}
