use std::sync::Arc;
use tanstack_ai::*;

/// Quick example: chat with OpenAI using tanstack-ai in Rust.
///
/// Usage:
///   OPENAI_API_KEY=sk-... cargo run
///
/// Or:
///   cargo run -- sk-...
#[tokio::main]
async fn main() {
    // Get API key from env or first arg
    let api_key = std::env::var("OPENAI_API_KEY")
        .or_else(|_| {
            std::env::args()
                .nth(1)
                .ok_or_else(|| "Provide OPENAI_API_KEY as env var or first argument".to_string())
        })
        .expect("No API key provided");

    // 1. Create an adapter
    let adapter: Arc<OpenAiTextAdapter> = Arc::new(openai_text("gpt-4o", &api_key));

    println!("=== Simple Text Chat ===\n");
    simple_text(adapter.clone()).await;

    println!("\n=== Chat with Tool ===\n");
    chat_with_tool(adapter.clone()).await;

    println!("\n=== Non-Streaming Chat ===\n");
    non_streaming(adapter.clone()).await;

    println!("\n=== Multi-Turn Conversation ===\n");
    multi_turn(adapter.clone()).await;

    println!("\nDone!");
}

/// Helper to build ChatOptions with defaults
fn chat_opts(adapter: Arc<OpenAiTextAdapter>, messages: Vec<ModelMessage>) -> ChatOptions {
    ChatOptions {
        adapter,
        messages,
        system_prompts: vec![],
        tools: vec![],
        temperature: None,
        top_p: None,
        max_tokens: None,
        metadata: None,
        model_options: None,
        agent_loop_strategy: None,
        conversation_id: None,
        middleware: vec![],
        stream: true,
        output_schema: None,
    }
}

/// Simple streaming text chat
async fn simple_text(adapter: Arc<OpenAiTextAdapter>) {
    let mut opts = chat_opts(
        adapter,
        vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Say hello in exactly 5 words.".into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
    );
    opts.stream = true;

    let result = chat(opts).await.unwrap();

    if let ChatResult::Chunks(chunks) = result {
        let text = extract_text(&chunks);
        println!("  Response: {}", text);
        println!("  Chunks received: {}", chunks.len());
    }
}

/// Chat with a tool that the model can call
async fn chat_with_tool(adapter: Arc<OpenAiTextAdapter>) {
    let weather_tool = Tool::new("get_weather", "Get current weather for a city")
        .with_input_schema(json_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "city": { "type": "string", "description": "City name" }
            },
            "required": ["city"]
        })))
        .with_execute(|args: serde_json::Value, _ctx| async move {
            let city = args["city"].as_str().unwrap_or("unknown");
            println!("  [Tool called: get_weather({})]", city);
            Ok(serde_json::json!({
                "city": city,
                "temperature": 72,
                "conditions": "Sunny",
                "unit": "fahrenheit"
            }))
        });

    let mut opts = chat_opts(
        adapter,
        vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("What's the weather in San Francisco?".into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
    );
    opts.tools = vec![weather_tool];

    let result = chat(opts).await.unwrap();

    if let ChatResult::Chunks(chunks) = result {
        let text = extract_text(&chunks);
        let tool_calls = count_chunk_type(&chunks, "TOOL_CALL_END");
        println!("  Response: {}", text);
        println!("  Tool calls executed: {}", tool_calls);
        println!("  Total chunks: {}", chunks.len());
    }
}

/// Non-streaming chat (collects all text at once)
async fn non_streaming(adapter: Arc<OpenAiTextAdapter>) {
    let mut opts = chat_opts(
        adapter,
        vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("What is 2+2? Reply with just the number.".into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
    );
    opts.stream = false;

    let result = chat(opts).await.unwrap();

    if let ChatResult::Text(text) = result {
        println!("  Response: {}", text);
    }
}

/// Multi-turn conversation
async fn multi_turn(adapter: Arc<OpenAiTextAdapter>) {
    let mut messages = vec![ModelMessage {
        role: MessageRole::User,
        content: MessageContent::Text("My favorite color is blue.".into()),
        name: None,
        tool_calls: None,
        tool_call_id: None,
    }];

    // First turn - get response
    let mut opts = chat_opts(adapter.clone(), messages.clone());
    opts.stream = false;
    let result = chat(opts).await.unwrap();

    let first_response = match &result {
        ChatResult::Text(t) => t.clone(),
        _ => String::new(),
    };
    println!("  Turn 1 response: {}", first_response);

    // Add assistant response to history
    messages.push(ModelMessage {
        role: MessageRole::Assistant,
        content: MessageContent::Text(first_response),
        name: None,
        tool_calls: None,
        tool_call_id: None,
    });

    // Second turn - follow up
    messages.push(ModelMessage {
        role: MessageRole::User,
        content: MessageContent::Text("What color did I just tell you?".into()),
        name: None,
        tool_calls: None,
        tool_call_id: None,
    });

    let mut opts = chat_opts(adapter, messages);
    opts.stream = false;
    let result = chat(opts).await.unwrap();

    if let ChatResult::Text(text) = result {
        println!("  Turn 2 response: {}", text);
    }
}

// Helpers

fn extract_text(chunks: &[StreamChunk]) -> String {
    let mut content = String::new();
    for chunk in chunks {
        if let StreamChunk::TextMessageContent {
            delta, content: full, ..
        } = chunk
        {
            if let Some(f) = full {
                content = f.clone();
            } else {
                content.push_str(delta);
            }
        }
    }
    content
}

fn count_chunk_type(chunks: &[StreamChunk], chunk_type: &str) -> usize {
    chunks
        .iter()
        .filter(|c| match chunk_type {
            "TOOL_CALL_END" => matches!(c, StreamChunk::ToolCallEnd { .. }),
            _ => false,
        })
        .count()
}
