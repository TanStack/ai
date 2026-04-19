//! Stream processor tests.

use tanstack_ai::stream::strategies::*;
use tanstack_ai::stream::StreamProcessor;
use tanstack_ai::types::*;

fn now() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64 / 1000.0
}

#[test]
fn test_processor_text_streaming() {
    let mut processor = StreamProcessor::new();

    processor.process_chunk(StreamChunk::TextMessageStart {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        role: "assistant".to_string(),
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "Hello".to_string(),
        content: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: " world!".to_string(),
        content: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageEnd {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        model: None,
    });

    let result = processor.result();
    assert_eq!(result.content, "Hello world!");
}

#[test]
fn test_processor_with_full_content() {
    let mut processor = StreamProcessor::new();

    processor.process_chunk(StreamChunk::TextMessageStart {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        role: "assistant".to_string(),
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "Final".to_string(),
        content: Some("Full content here".to_string()),
        model: None,
    });

    let result = processor.result();
    assert_eq!(result.content, "Full content here");
}

#[test]
fn test_processor_tool_calls() {
    let mut processor = StreamProcessor::new();

    processor.process_chunk(StreamChunk::ToolCallStart {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        delta: "{\"city\":".to_string(),
        args: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::ToolCallArgs {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        delta: "\"NYC\"}".to_string(),
        args: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::ToolCallEnd {
        timestamp: now(),
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        input: Some(serde_json::json!({"city": "NYC"})),
        result: None,
        model: None,
    });

    let result = processor.result();
    assert!(result.tool_calls.is_some());
    let tool_calls = result.tool_calls.unwrap();
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].function.name, "getWeather");
    assert_eq!(tool_calls[0].function.arguments, "{\"city\":\"NYC\"}");
}

#[test]
fn test_processor_with_batch_strategy() {
    let mut processor = StreamProcessor::with_strategy(Box::new(BatchStrategy::new(2)));

    // First chunk: should not emit (batch size 2)
    let r1 = processor.process_chunk(StreamChunk::TextMessageStart {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        role: "assistant".to_string(),
        model: None,
    });
    assert_eq!(r1.len(), 1); // Start always passes through

    let r2 = processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "a".to_string(),
        content: None,
        model: None,
    });
    assert!(r2.is_empty()); // Batch: not enough chunks yet

    let r3 = processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "b".to_string(),
        content: None,
        model: None,
    });
    assert_eq!(r3.len(), 1); // Batch: reached 2 chunks

    let r4 = processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "c".to_string(),
        content: None,
        model: None,
    });
    assert!(r4.is_empty()); // Final chunk is still buffered

    let r5 = processor.process_chunk(StreamChunk::TextMessageEnd {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        model: None,
    });
    assert_eq!(r5.len(), 2); // Flush buffered text, then emit end
    assert!(matches!(r5[0], StreamChunk::TextMessageContent { .. }));
    assert!(matches!(r5[1], StreamChunk::TextMessageEnd { .. }));
}

#[test]
fn test_processor_recording() {
    let mut processor = StreamProcessor::new();
    processor.enable_recording();

    processor.process_chunk(StreamChunk::RunStarted {
        timestamp: now(),
        run_id: "run-1".to_string(),
        thread_id: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "Hello".to_string(),
        content: None,
        model: None,
    });

    assert_eq!(processor.recordings().len(), 2);

    let recording = processor.to_recording(Some("gpt-4o".to_string()), Some("openai".to_string()));
    assert_eq!(recording.version, "1.0");
    assert_eq!(recording.model, Some("gpt-4o".to_string()));
    assert_eq!(recording.chunks.len(), 2);
}

#[test]
fn test_processor_thinking_content() {
    let mut processor = StreamProcessor::new();

    processor.process_chunk(StreamChunk::TextMessageStart {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        role: "assistant".to_string(),
        model: None,
    });

    processor.process_chunk(StreamChunk::StepFinished {
        timestamp: now(),
        step_id: "step-1".to_string(),
        delta: "Let me think...".to_string(),
        content: None,
        model: None,
    });

    processor.process_chunk(StreamChunk::TextMessageContent {
        timestamp: now(),
        message_id: "msg-1".to_string(),
        delta: "Here's my answer.".to_string(),
        content: None,
        model: None,
    });

    let result = processor.result();
    assert_eq!(result.thinking, Some("Let me think...".to_string()));
    assert_eq!(result.content, "Here's my answer.");
}
