use crate::agui::ChatMessage;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use std::env;

pub async fn stream_openai(
    client: &Client,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    mut emit: impl FnMut(String) -> Result<(), String>,
) -> Result<(), String> {
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY is not set".to_string())?;

    let mut openai_messages: Vec<Value> = Vec::new();
    if !system.is_empty() {
        openai_messages.push(json!({
            "role": "system",
            "content": system,
        }));
    }
    for message in messages {
        openai_messages.push(json!({
            "role": message.role,
            "content": message.content,
        }));
    }

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": openai_messages,
            "stream": true,
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "openai request failed ({status}): {}",
            body.trim()
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = line.trim_start_matches("data: ");
            if data == "[DONE]" {
                return Ok(());
            }

            let parsed: Value = match serde_json::from_str(data) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if let Some(delta) = parsed
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
            {
                emit(delta.to_string())?;
            }
        }
    }

    Ok(())
}

pub async fn stream_anthropic(
    client: &Client,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    mut emit: impl FnMut(String) -> Result<(), String>,
) -> Result<(), String> {
    let api_key = env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY is not set".to_string())?;

    let anthropic_messages: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect();

    let mut body = json!({
        "model": model,
        "max_tokens": 4096,
        "messages": anthropic_messages,
        "stream": true,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "anthropic request failed ({status}): {}",
            body.trim()
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end_matches('\r').to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = line.trim_start_matches("data: ");
            let parsed: Value = match serde_json::from_str(data) {
                Ok(value) => value,
                Err(_) => continue,
            };

            if parsed.get("type").and_then(Value::as_str) != Some("content_block_delta") {
                continue;
            }
            if parsed
                .pointer("/delta/type")
                .and_then(Value::as_str)
                != Some("text_delta")
            {
                continue;
            }
            if let Some(text) = parsed.pointer("/delta/text").and_then(Value::as_str) {
                emit(text.to_string())?;
            }
        }
    }

    Ok(())
}

pub async fn stream_completion(
    client: &Client,
    provider: &str,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    emit: impl FnMut(String) -> Result<(), String>,
) -> Result<(), String> {
    match provider {
        "openai" => stream_openai(client, model, system, messages, emit).await,
        "anthropic" => stream_anthropic(client, model, system, messages, emit).await,
        other => Err(format!(
            "unsupported provider {other:?} (expected openai or anthropic)"
        )),
    }
}
