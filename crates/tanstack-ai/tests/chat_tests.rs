//! Chat engine integration tests with mock adapter.
//!
//! Ports the TypeScript chat.test.ts patterns to Rust.

mod test_utils;

use std::sync::Arc;
use tanstack_ai::*;
use test_utils::*;

// ============================================================================
// Streaming text (no tools)
// ============================================================================

#[tokio::test]
async fn test_streaming_text_yields_all_chunks() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        text_start("msg-1"),
        text_content("Hello", "msg-1"),
        text_content(" world!", "msg-1"),
        text_end("msg-1"),
        run_finished("stop", "run-1"),
    ]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
    })
    .await
    .unwrap();

    match result {
        ChatResult::Chunks(chunks) => {
            assert_eq!(chunks.len(), 6);
            assert_eq!(count_chunk_type(&chunks, "RUN_STARTED"), 1);
            assert_eq!(count_chunk_type(&chunks, "TEXT_MESSAGE_START"), 1);
            assert_eq!(count_chunk_type(&chunks, "TEXT_MESSAGE_CONTENT"), 2);
            assert_eq!(count_chunk_type(&chunks, "TEXT_MESSAGE_END"), 1);
            assert_eq!(count_chunk_type(&chunks, "RUN_FINISHED"), 1);
        }
        _ => panic!("Expected Chunks result"),
    }
}

#[tokio::test]
async fn test_streaming_text_passes_messages() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        text_content("Hi", "msg-1"),
        run_finished("stop", "run-1"),
    ]]));

    let chat_adapter = adapter.clone();

    let _ = chat(ChatOptions {
        adapter: chat_adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
    })
    .await
    .unwrap();

    let calls = adapter.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].messages.len(), 1);
    assert_eq!(calls[0].messages[0].role, MessageRole::User);
}

#[tokio::test]
async fn test_streaming_text_passes_options() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        run_finished("stop", "run-1"),
    ]]));

    let _ = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec!["You are helpful".to_string()],
        tools: vec![],
        temperature: Some(0.5),
        top_p: Some(0.9),
        max_tokens: Some(100),
        metadata: None,
        model_options: None,
        agent_loop_strategy: None,
        conversation_id: None,
        middleware: vec![],
        stream: true,
        output_schema: None,
    })
    .await
    .unwrap();

    let calls = adapter.calls();
    assert_eq!(calls[0].system_prompts, vec!["You are helpful"]);
    assert_eq!(calls[0].temperature, Some(0.5));
    assert_eq!(calls[0].top_p, Some(0.9));
    assert_eq!(calls[0].max_tokens, Some(100));
}

// ============================================================================
// Non-streaming text (stream: false)
// ============================================================================

#[tokio::test]
async fn test_non_streaming_returns_collected_text() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        text_start("msg-1"),
        text_content("Hello", "msg-1"),
        text_content(" world!", "msg-1"),
        text_end("msg-1"),
        run_finished("stop", "run-1"),
    ]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
        stream: false,
        output_schema: None,
    })
    .await
    .unwrap();

    match result {
        ChatResult::Text(text) => assert_eq!(text, "Hello world!"),
        _ => panic!("Expected Text result"),
    }
}

// ============================================================================
// Server tool execution
// ============================================================================

#[tokio::test]
async fn test_server_tool_execution() {
    let tool = server_tool("getWeather", serde_json::json!({"temp": 72}));
    let adapter = Arc::new(MockAdapter::new(vec![
        // First iteration: model requests tool
        vec![
            run_started("run-1"),
            text_start("msg-1"),
            text_content("Let me check.", "msg-1"),
            text_end("msg-1"),
            tool_start("call_1", "getWeather", None),
            tool_args("call_1", "{\"city\":\"NYC\"}"),
            run_finished("tool_calls", "run-1"),
        ],
        // Second iteration: model produces final text
        vec![
            run_started("run-2"),
            text_start("msg-2"),
            text_content("72F in NYC.", "msg-2"),
            text_end("msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let result = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Weather?".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
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
    })
    .await
    .unwrap();

    // Adapter was called twice (tool call + final text)
    assert_eq!(adapter.call_count(), 2);

    // Second call should have tool result in messages
    let calls = adapter.calls();
    let second_call_messages = &calls[1].messages;
    let has_tool_result = second_call_messages
        .iter()
        .any(|m| m.role == MessageRole::Tool);
    assert!(
        has_tool_result,
        "Expected tool result message in second call"
    );

    // Should have TOOL_CALL_END chunks
    match result {
        ChatResult::Chunks(chunks) => {
            let tool_ends = count_chunk_type(&chunks, "TOOL_CALL_END");
            assert!(tool_ends >= 1, "Expected at least one TOOL_CALL_END");
        }
        _ => panic!("Expected Chunks result"),
    }
}

#[tokio::test]
async fn test_tool_execution_error_handled_gracefully() {
    // Create a tool that always fails
    let tool = Tool::new("failTool", "A tool that fails").with_execute(
        |_args: serde_json::Value, _ctx| async {
            Err(AiError::ToolExecution("Tool broke".to_string()))
        },
    );

    let adapter = Arc::new(MockAdapter::new(vec![
        vec![
            run_started("run-1"),
            tool_start("call_1", "failTool", None),
            tool_args("call_1", "{}"),
            run_finished("tool_calls", "run-1"),
        ],
        vec![
            run_started("run-2"),
            text_content("Error happened.", "msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Do something".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
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
    })
    .await
    .unwrap();

    match result {
        ChatResult::Chunks(chunks) => {
            // Should still complete with error result
            let tool_ends: Vec<_> = chunks
                .iter()
                .filter(|c| matches!(c, StreamChunk::ToolCallEnd { .. }))
                .collect();
            assert!(!tool_ends.is_empty(), "Expected TOOL_CALL_END with error");
        }
        _ => panic!("Expected Chunks result"),
    }
}

// ============================================================================
// Parallel tool calls
// ============================================================================

#[tokio::test]
async fn test_parallel_tool_calls() {
    let weather_tool = server_tool("getWeather", serde_json::json!({"temp": 72}));
    let time_tool = server_tool("getTime", serde_json::json!({"time": "3pm"}));

    let adapter = Arc::new(MockAdapter::new(vec![
        // Model requests two tools
        vec![
            run_started("run-1"),
            tool_start("call_1", "getWeather", Some(0)),
            tool_start("call_2", "getTime", Some(1)),
            tool_args("call_1", "{\"city\":\"NYC\"}"),
            tool_args("call_2", "{\"tz\":\"EST\"}"),
            run_finished("tool_calls", "run-1"),
        ],
        // Model produces final text
        vec![
            run_started("run-2"),
            text_content("It's 3pm and 72F in NYC.", "msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let _result = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Weather and time?".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![weather_tool, time_tool],
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
    })
    .await
    .unwrap();

    // Second call should have two tool result messages
    let calls = adapter.calls();
    let second_call_messages = &calls[1].messages;
    let tool_results: Vec<_> = second_call_messages
        .iter()
        .filter(|m| m.role == MessageRole::Tool)
        .collect();
    assert_eq!(tool_results.len(), 2, "Expected 2 tool results");
}

// ============================================================================
// Multi-iteration agent loop
// ============================================================================

#[tokio::test]
async fn test_multi_iteration_agent_loop() {
    let tool1 = server_tool("search", serde_json::json!({"results": "found"}));
    let tool2 = server_tool("analyze", serde_json::json!({"analysis": "done"}));

    let adapter = Arc::new(MockAdapter::new(vec![
        // Iteration 1: search
        vec![
            run_started("run-1"),
            tool_start("call_1", "search", None),
            tool_args("call_1", "{\"query\":\"test\"}"),
            run_finished("tool_calls", "run-1"),
        ],
        // Iteration 2: analyze
        vec![
            run_started("run-2"),
            tool_start("call_2", "analyze", None),
            tool_args("call_2", "{\"data\":\"found\"}"),
            run_finished("tool_calls", "run-2"),
        ],
        // Iteration 3: final text
        vec![
            run_started("run-3"),
            text_content("Analysis complete.", "msg-3"),
            run_finished("stop", "run-3"),
        ],
    ]));

    let result = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Research this".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool1, tool2],
        temperature: None,
        top_p: None,
        max_tokens: None,
        metadata: None,
        model_options: None,
        agent_loop_strategy: None, // Uses default max_iterations(5)
        conversation_id: None,
        middleware: vec![],
        stream: true,
        output_schema: None,
    })
    .await
    .unwrap();

    // Should have called adapter 3 times
    assert_eq!(adapter.call_count(), 3);

    // Final text should be present
    match result {
        ChatResult::Chunks(chunks) => {
            let text = collect_text(&chunks);
            assert_eq!(text, "Analysis complete.");
        }
        _ => panic!("Expected Chunks result"),
    }
}

// ============================================================================
// Agent loop strategy enforcement
// ============================================================================

#[tokio::test]
async fn test_agent_loop_respects_max_iterations() {
    let tool = server_tool("loop", serde_json::json!({"result": "ok"}));

    // Adapter always returns tool_calls - would loop forever without strategy
    let adapter = Arc::new(MockAdapter::new(vec![
        vec![
            run_started("run-1"),
            tool_start("call_1", "loop", None),
            tool_args("call_1", "{}"),
            run_finished("tool_calls", "run-1"),
        ],
        vec![
            run_started("run-2"),
            tool_start("call_2", "loop", None),
            tool_args("call_2", "{}"),
            run_finished("tool_calls", "run-2"),
        ],
        vec![
            run_started("run-3"),
            tool_start("call_3", "loop", None),
            tool_args("call_3", "{}"),
            run_finished("tool_calls", "run-3"),
        ],
    ]));

    let _result = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Loop test".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
        temperature: None,
        top_p: None,
        max_tokens: None,
        metadata: None,
        model_options: None,
        agent_loop_strategy: Some(max_iterations(2)), // Only allow 2 iterations
        conversation_id: None,
        middleware: vec![],
        stream: true,
        output_schema: None,
    })
    .await
    .unwrap();

    // Should stop at 2 iterations even though adapter has 3
    assert_eq!(adapter.call_count(), 2);
}

// ============================================================================
// Non-streaming with tools
// ============================================================================

#[tokio::test]
async fn test_non_streaming_still_executes_tools() {
    let tool = server_tool("getWeather", serde_json::json!({"temp": 72}));

    let adapter = Arc::new(MockAdapter::new(vec![
        vec![
            run_started("run-1"),
            tool_start("call_1", "getWeather", None),
            tool_args("call_1", "{\"city\":\"NYC\"}"),
            run_finished("tool_calls", "run-1"),
        ],
        vec![
            run_started("run-2"),
            text_content("72F in NYC", "msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Weather in NYC?".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
        temperature: None,
        top_p: None,
        max_tokens: None,
        metadata: None,
        model_options: None,
        agent_loop_strategy: None,
        conversation_id: None,
        middleware: vec![],
        stream: false,
        output_schema: None,
    })
    .await
    .unwrap();

    match result {
        ChatResult::Text(text) => assert_eq!(text, "72F in NYC"),
        _ => panic!("Expected Text result"),
    }
}

// ============================================================================
// Text accumulation across chunks
// ============================================================================

#[tokio::test]
async fn test_text_accumulates_across_content_chunks() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        text_start("msg-1"),
        text_content("Hello", "msg-1"),
        text_content(" ", "msg-1"),
        text_content("world", "msg-1"),
        text_content("!", "msg-1"),
        text_end("msg-1"),
        run_finished("stop", "run-1"),
    ]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
        stream: false,
        output_schema: None,
    })
    .await
    .unwrap();

    match result {
        ChatResult::Text(text) => assert_eq!(text, "Hello world!"),
        _ => panic!("Expected Text result"),
    }
}

// ============================================================================
// Custom events from tool execution
// ============================================================================

#[tokio::test]
async fn test_tool_receives_correct_arguments() {
    let (tool, captured) = capturing_tool("getWeather");

    let adapter = Arc::new(MockAdapter::new(vec![
        vec![
            run_started("run-1"),
            tool_start("call_1", "getWeather", None),
            tool_args("call_1", "{\"city\":\"NYC\",\"unit\":\"fahrenheit\"}"),
            run_finished("tool_calls", "run-1"),
        ],
        vec![
            run_started("run-2"),
            text_content("Done.", "msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let _ = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Weather?".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
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
    })
    .await
    .unwrap();

    // Check captured arguments
    let captured_args = captured.lock().unwrap();
    assert_eq!(captured_args.len(), 1);
    assert_eq!(captured_args[0]["city"], "NYC");
    assert_eq!(captured_args[0]["unit"], "fahrenheit");
}

// ============================================================================
// Thinking/step events
// ============================================================================

#[tokio::test]
async fn test_thinking_step_events_passed_through() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        text_start("msg-1"),
        step_finished("Let me think...", "step-1"),
        text_content("Here is my answer.", "msg-1"),
        text_end("msg-1"),
        run_finished("stop", "run-1"),
    ]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Think about it".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
    })
    .await
    .unwrap();

    match result {
        ChatResult::Chunks(chunks) => {
            let step_chunks: Vec<_> = chunks
                .iter()
                .filter(|c| matches!(c, StreamChunk::StepFinished { .. }))
                .collect();
            assert_eq!(step_chunks.len(), 1, "Expected StepFinished chunk");
            let text = collect_text(&chunks);
            assert_eq!(text, "Here is my answer.");
        }
        _ => panic!("Expected Chunks result"),
    }
}

// ============================================================================
// Error handling
// ============================================================================

#[tokio::test]
async fn test_run_error_from_adapter() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![
        run_started("run-1"),
        run_error("Something went wrong", "run-1"),
    ]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
    })
    .await
    .unwrap();

    match result {
        ChatResult::Chunks(chunks) => {
            let error_chunks: Vec<_> = chunks
                .iter()
                .filter(|c| matches!(c, StreamChunk::RunError { .. }))
                .collect();
            assert_eq!(error_chunks.len(), 1);
        }
        _ => panic!("Expected Chunks result"),
    }
}

// ============================================================================
// Empty adapter response
// ============================================================================

#[tokio::test]
async fn test_empty_adapter_response() {
    let adapter = Arc::new(MockAdapter::new(vec![vec![]]));

    let result = chat(ChatOptions {
        adapter,
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
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
    })
    .await
    .unwrap();

    match result {
        ChatResult::Chunks(chunks) => assert!(chunks.is_empty()),
        _ => panic!("Expected Chunks result"),
    }
}

// ============================================================================
// Tool with tool_calls finish but no TOOL_CALL events
// ============================================================================

#[tokio::test]
async fn test_tool_calls_finish_without_tool_events() {
    // Edge case: finish_reason is tool_calls but no tool call events were emitted
    let adapter = Arc::new(MockAdapter::new(vec![
        vec![
            run_started("run-1"),
            text_content("I tried.", "msg-1"),
            run_finished("tool_calls", "run-1"),
        ],
        vec![
            run_started("run-2"),
            text_content("OK.", "msg-2"),
            run_finished("stop", "run-2"),
        ],
    ]));

    let tool = server_tool("unused", serde_json::json!({}));

    let _result = chat(ChatOptions {
        adapter: adapter.clone(),
        messages: vec![ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hi".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }],
        system_prompts: vec![],
        tools: vec![tool],
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
    })
    .await
    .unwrap();

    // Should have called adapter twice (no tool calls to execute, but still loops)
    assert_eq!(adapter.call_count(), 2);
}
