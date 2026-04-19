use bytes::Bytes;
use futures_util::Stream;
use std::pin::Pin;

use crate::error::{AiError, AiResult};
use crate::types::StreamChunk;

/// Parse an SSE event line into (field, value).
pub fn parse_sse_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with(':') {
        return None;
    }

    if let Some(colon_pos) = line.find(':') {
        let field = &line[..colon_pos];
        let value = line[colon_pos + 1..].trim_start();
        Some((field.to_string(), value.to_string()))
    } else {
        Some((line.to_string(), String::new()))
    }
}

/// Parse SSE data from a byte stream into JSON values.
pub fn sse_stream_to_json(
    stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
) -> Pin<Box<dyn Stream<Item = AiResult<serde_json::Value>> + Send>> {
    use futures_util::StreamExt;

    let lines = tokio_util::codec::FramedRead::new(
        tokio_util::io::StreamReader::new(
            stream.map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))),
        ),
        tokio_util::codec::LinesCodec::new(),
    );

    let stream = futures_util::stream::unfold(
        (lines, String::new()),
        |(mut lines, mut data_buf)| async move {
            loop {
                match lines.next().await {
                    Some(Ok(line)) => {
                        if line.trim().is_empty() {
                            // Empty line signals end of SSE event
                            if !data_buf.is_empty() {
                                let data = data_buf.clone();
                                data_buf.clear();

                                // Handle [DONE] sentinel
                                if data.trim() == "[DONE]" {
                                    return None;
                                }

                                match serde_json::from_str::<serde_json::Value>(&data) {
                                    Ok(json) => return Some((Ok(json), (lines, data_buf))),
                                    Err(e) => {
                                        return Some((
                                            Err(AiError::Stream(format!(
                                                "Failed to parse SSE data: {}",
                                                e
                                            ))),
                                            (lines, data_buf),
                                        ));
                                    }
                                }
                            }
                            continue;
                        }

                        if let Some((field, value)) = parse_sse_line(&line) {
                            if field == "data" {
                                if !data_buf.is_empty() {
                                    data_buf.push('\n');
                                }
                                data_buf.push_str(&value);
                            }
                            // Ignore other fields (id, event, retry)
                        }
                    }
                    Some(Err(e)) => {
                        return Some((Err(AiError::Stream(e.to_string())), (lines, data_buf)));
                    }
                    None => return None, // Stream ended
                }
            }
        },
    );

    Box::pin(stream)
}

/// Convert a stream of StreamChunks to an HTTP response with SSE format.
pub fn chunks_to_sse_stream(
    stream: Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>,
) -> Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>> {
    use futures_util::StreamExt;

    stream
        .map(|result| match result {
            Ok(chunk) => match serde_json::to_string(&chunk) {
                Ok(json) => Ok(Bytes::from(format!("data: {}\n\n", json))),
                Err(err) => Ok(Bytes::from(format!(
                    "data: {}\n\n",
                    serde_json::json!({
                        "type": "RUN_ERROR",
                        "error": { "message": format!("failed to serialize stream chunk: {}", err) }
                    })
                ))),
            },
            Err(e) => Ok(Bytes::from(format!(
                "data: {}\n\n",
                serde_json::json!({"type": "RUN_ERROR", "error": {"message": e.to_string()}})
            ))),
        })
        .boxed()
}

/// Stream chunks to collected text.
pub async fn stream_to_text(
    stream: &mut Pin<Box<dyn Stream<Item = AiResult<StreamChunk>> + Send>>,
) -> AiResult<String> {
    use futures_util::StreamExt;
    let mut content = String::new();

    while let Some(result) = stream.next().await {
        match result? {
            StreamChunk::TextMessageContent {
                delta,
                content: full,
                ..
            } => {
                if let Some(full_content) = full {
                    content = full_content;
                } else {
                    content.push_str(&delta);
                }
            }
            StreamChunk::RunError { error, .. } => {
                return Err(AiError::Provider(error.message));
            }
            _ => {}
        }
    }

    Ok(content)
}
