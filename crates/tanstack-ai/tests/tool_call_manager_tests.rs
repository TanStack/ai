//! Tool call manager tests.

use tanstack_ai::tools::ToolCallManager;
use tanstack_ai::types::*;

fn now() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64 / 1000.0
}

#[test]
fn test_manager_accumulate_tool_calls() {
    let mut manager = ToolCallManager::new();

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    assert!(manager.has_tool_calls());
    let calls = manager.tool_calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].function.name, "getWeather");
}

#[test]
fn test_manager_accumulate_arguments() {
    let mut manager = ToolCallManager::new();

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    manager.add_args_event(&StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        delta: "{\"city\":".to_string(),
        args: None,
        model: None,
    });

    manager.add_args_event(&StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        delta: "\"NYC\"}".to_string(),
        args: None,
        model: None,
    });

    let calls = manager.tool_calls();
    assert_eq!(calls[0].function.arguments, "{\"city\":\"NYC\"}");
}

#[test]
fn test_manager_complete_tool_call() {
    let mut manager = ToolCallManager::new();

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    manager.complete_tool_call(&StreamChunk::ToolCallEnd {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        input: Some(serde_json::json!({"city": "NYC"})),
        result: None,
        model: None,
    });

    let calls = manager.tool_calls();
    assert_eq!(calls[0].function.arguments, "{\"city\":\"NYC\"}");
}

#[test]
fn test_manager_clear() {
    let mut manager = ToolCallManager::new();

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    assert!(manager.has_tool_calls());
    manager.clear();
    assert!(!manager.has_tool_calls());
}

#[test]
fn test_manager_filters_incomplete_calls() {
    let mut manager = ToolCallManager::new();

    // Add call with empty name (incomplete)
    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    assert!(!manager.has_tool_calls());
}

#[test]
fn test_manager_parallel_tool_calls() {
    let mut manager = ToolCallManager::new();

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    manager.add_start_event(&StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_2".to_string(),
        tool_name: "getTime".to_string(),
        parent_message_id: None,
        index: Some(1),
        provider_metadata: None,
        model: None,
    });

    manager.add_args_event(&StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        delta: "{\"city\":\"NYC\"}".to_string(),
        args: None,
        model: None,
    });

    manager.add_args_event(&StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_2".to_string(),
        delta: "{\"tz\":\"EST\"}".to_string(),
        args: None,
        model: None,
    });

    let calls = manager.tool_calls();
    assert_eq!(calls.len(), 2);
}
