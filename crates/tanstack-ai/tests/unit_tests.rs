//! Comprehensive tests for tanstack-ai.
//!
//! Ports the TypeScript test suite to Rust with full feature parity.

use std::sync::Arc;
use tanstack_ai::*;

// ============================================================================
// Strategies Tests
// ============================================================================

#[test]
fn test_immediate_strategy_always_emits() {
    let mut strategy = ImmediateStrategy;
    assert!(strategy.should_emit("", ""));
    assert!(strategy.should_emit("hello", "hello"));
    assert!(strategy.should_emit("world", "hello world"));
}

#[test]
fn test_immediate_strategy_empty_strings() {
    let mut strategy = ImmediateStrategy;
    assert!(strategy.should_emit("", ""));
    assert!(strategy.should_emit("", "accumulated"));
}

#[test]
fn test_punctuation_strategy_emits_on_punctuation() {
    let mut strategy = PunctuationStrategy::new();
    assert!(strategy.should_emit("Hello.", "Hello."));
    assert!(strategy.should_emit("World!", "Hello. World!"));
    assert!(strategy.should_emit("How?", "Hello. World! How?"));
    assert!(strategy.should_emit("Test;", "Test;"));
    assert!(strategy.should_emit("Test:", "Test:"));
}

#[test]
fn test_punctuation_strategy_no_punctuation() {
    let mut strategy = PunctuationStrategy::new();
    assert!(!strategy.should_emit("Hello", "Hello"));
    assert!(!strategy.should_emit("world", "Hello world"));
    assert!(!strategy.should_emit("test", "Hello world test"));
}

#[test]
fn test_punctuation_strategy_newline() {
    let mut strategy = PunctuationStrategy::new();
    assert!(strategy.should_emit("Line 1\n", "Line 1\n"));
    assert!(strategy.should_emit("\nLine 2", "Line 1\n\nLine 2"));
}

#[test]
fn test_punctuation_strategy_comma() {
    let mut strategy = PunctuationStrategy::new();
    assert!(strategy.should_emit("Hello,", "Hello,"));
    assert!(strategy.should_emit("world,", "Hello, world,"));
}

#[test]
fn test_batch_strategy_emits_every_n() {
    let mut strategy = BatchStrategy::new(3);
    assert!(!strategy.should_emit("chunk1", "chunk1"));
    assert!(!strategy.should_emit("chunk2", "chunk1chunk2"));
    assert!(strategy.should_emit("chunk3", "chunk1chunk2chunk3"));
    assert!(!strategy.should_emit("chunk4", "chunk1chunk2chunk3chunk4"));
    assert!(!strategy.should_emit("chunk5", "chunk1chunk2chunk3chunk4chunk5"));
    assert!(strategy.should_emit("chunk6", "chunk1chunk2chunk3chunk4chunk5chunk6"));
}

#[test]
fn test_batch_strategy_default_size() {
    let mut strategy = BatchStrategy::default();
    for i in 1..5 {
        assert!(!strategy.should_emit(&format!("chunk{}", i), &"x".repeat(i)));
    }
    assert!(strategy.should_emit("chunk5", "xxxxx"));
}

#[test]
fn test_batch_strategy_resets_after_emit() {
    let mut strategy = BatchStrategy::new(2);
    assert!(!strategy.should_emit("chunk1", "chunk1"));
    assert!(strategy.should_emit("chunk2", "chunk1chunk2"));
    // Counter resets
    assert!(!strategy.should_emit("chunk3", "chunk1chunk2chunk3"));
    assert!(strategy.should_emit("chunk4", "chunk1chunk2chunk3chunk4"));
}

#[test]
fn test_batch_strategy_size_one() {
    let mut strategy = BatchStrategy::new(1);
    assert!(strategy.should_emit("chunk1", "chunk1"));
    assert!(strategy.should_emit("chunk2", "chunk1chunk2"));
    assert!(strategy.should_emit("chunk3", "chunk1chunk2chunk3"));
}

#[test]
fn test_batch_strategy_reset_method() {
    let mut strategy = BatchStrategy::new(3);
    assert!(!strategy.should_emit("chunk1", "chunk1"));
    assert!(!strategy.should_emit("chunk2", "chunk1chunk2"));
    strategy.reset();
    assert!(!strategy.should_emit("chunk3", "chunk1chunk2chunk3"));
    assert!(!strategy.should_emit("chunk4", "chunk1chunk2chunk3chunk4"));
    assert!(strategy.should_emit("chunk5", "chunk1chunk2chunk3chunk4chunk5"));
}

#[test]
fn test_word_boundary_strategy_whitespace() {
    let mut strategy = WordBoundaryStrategy;
    assert!(strategy.should_emit("Hello ", "Hello "));
    assert!(strategy.should_emit("world ", "Hello world "));
    assert!(strategy.should_emit("test\n", "Hello world test\n"));
    assert!(strategy.should_emit("more\t", "Hello world test\nmore\t"));
}

#[test]
fn test_word_boundary_strategy_no_whitespace() {
    let mut strategy = WordBoundaryStrategy;
    assert!(!strategy.should_emit("Hello", "Hello"));
    assert!(!strategy.should_emit("world", "Helloworld"));
    assert!(!strategy.should_emit("test", "Helloworldtest"));
}

#[test]
fn test_composite_strategy_or_logic() {
    let mut strategy = CompositeStrategy::new(vec![
        Box::new(ImmediateStrategy),
        Box::new(PunctuationStrategy::new()),
    ]);
    // ImmediateStrategy always returns true
    assert!(strategy.should_emit("hello", "hello"));
    assert!(strategy.should_emit("world", "hello world"));
}

#[test]
fn test_composite_strategy_all_false() {
    let mut strategy = CompositeStrategy::new(vec![
        Box::new(BatchStrategy::new(10)),
        Box::new(WordBoundaryStrategy),
    ]);
    assert!(!strategy.should_emit("Hello", "Hello"));
    assert!(!strategy.should_emit("world", "Helloworld"));
}

#[test]
fn test_composite_strategy_any_true() {
    let mut strategy = CompositeStrategy::new(vec![
        Box::new(BatchStrategy::new(10)),
        Box::new(WordBoundaryStrategy),
    ]);
    // Batch says no, but wordBoundary says yes
    assert!(strategy.should_emit("Hello ", "Hello "));
}

#[test]
fn test_composite_strategy_reset() {
    let mut strategy = CompositeStrategy::new(vec![
        Box::new(BatchStrategy::new(3)),
        Box::new(BatchStrategy::new(5)),
    ]);
    strategy.should_emit("chunk1", "chunk1");
    strategy.should_emit("chunk2", "chunk1chunk2");
    strategy.reset();
    assert!(!strategy.should_emit("chunk3", "chunk1chunk2chunk3"));
    assert!(!strategy.should_emit("chunk4", "chunk1chunk2chunk3chunk4"));
    assert!(strategy.should_emit("chunk5", "chunk1chunk2chunk3chunk4chunk5"));
}

#[test]
fn test_strategies_unicode() {
    let mut punctuation = PunctuationStrategy::new();
    let mut word_boundary = WordBoundaryStrategy;

    assert!(punctuation.should_emit("Hello 世界.", "Hello 世界."));
    assert!(word_boundary.should_emit("世界 ", "Hello 世界 "));
    assert!(!word_boundary.should_emit("世界", "Hello 世界"));
}

#[test]
fn test_strategies_empty_chunks() {
    assert!(ImmediateStrategy.should_emit("", ""));
    assert!(!PunctuationStrategy::new().should_emit("", ""));
    assert!(!WordBoundaryStrategy.should_emit("", ""));
}

// ============================================================================
// Agent Loop Strategy Tests
// ============================================================================

fn make_state(iteration_count: u32, finish_reason: Option<&str>) -> AgentLoopState {
    AgentLoopState {
        iteration_count,
        messages: vec![],
        finish_reason: finish_reason.map(String::from),
    }
}

#[test]
fn test_max_iterations_below_max() {
    let strategy = max_iterations(5);
    assert!(strategy(&make_state(0, None)));
    assert!(strategy(&make_state(2, None)));
    assert!(strategy(&make_state(4, None)));
}

#[test]
fn test_max_iterations_at_max() {
    let strategy = max_iterations(5);
    assert!(!strategy(&make_state(5, None)));
    assert!(!strategy(&make_state(6, None)));
}

#[test]
fn test_max_iterations_one() {
    let strategy = max_iterations(1);
    assert!(strategy(&make_state(0, None)));
    assert!(!strategy(&make_state(1, None)));
}

#[test]
fn test_max_iterations_zero() {
    let strategy = max_iterations(0);
    assert!(!strategy(&make_state(0, None)));
}

#[test]
fn test_until_finish_reason_stops_on_match() {
    let strategy = until_finish_reason("stop".to_string());
    assert!(!strategy(&make_state(1, Some("stop"))));
}

#[test]
fn test_until_finish_reason_continues_on_no_match() {
    let strategy = until_finish_reason("stop".to_string());
    assert!(strategy(&make_state(1, Some("tool_calls"))));
    assert!(strategy(&make_state(1, None)));
}

#[test]
fn test_combine_strategies_all_true() {
    let strategy = combine_strategies(vec![
        max_iterations(5),
        Arc::new(|state: &AgentLoopState| state.iteration_count < 10),
    ]);
    assert!(strategy(&make_state(2, None)));
}

#[test]
fn test_combine_strategies_any_false() {
    let strategy = combine_strategies(vec![
        max_iterations(5),
        Arc::new(|state: &AgentLoopState| state.iteration_count < 10),
    ]);
    assert!(!strategy(&make_state(5, None)));
}

#[test]
fn test_text_options_clone_preserves_agent_loop_strategy() {
    let options = TextOptions {
        agent_loop_strategy: Some(max_iterations(2)),
        ..Default::default()
    };

    let cloned = options.clone();
    assert!(cloned.agent_loop_strategy.is_some());
    assert!((cloned.agent_loop_strategy.unwrap())(&make_state(1, None)));
}

#[test]
fn test_combine_strategies_empty() {
    let strategy = combine_strategies(vec![]);
    assert!(strategy(&make_state(0, None)));
}

// ============================================================================
// Tool Definition Tests
// ============================================================================

#[test]
fn test_tool_definition_basic() {
    let def = tool_definition("getWeather", "Get the weather for a location");
    assert_eq!(def.name, "getWeather");
    assert_eq!(def.description, "Get the weather for a location");
}

#[test]
fn test_tool_definition_with_schemas() {
    let def = tool_definition("addToCart", "Add item to cart")
        .input_schema(json_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "itemId": { "type": "string" },
                "quantity": { "type": "number" }
            }
        })))
        .output_schema(json_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "cartId": { "type": "string" }
            }
        })));

    assert!(def.input_schema.is_some());
    assert!(def.output_schema.is_some());
}

#[test]
fn test_tool_definition_to_tool() {
    let def = tool_definition("simpleTool", "A simple tool");
    let tool = def.to_tool();
    assert_eq!(tool.name, "simpleTool");
    assert_eq!(tool.description, "A simple tool");
    assert!(!tool.needs_approval);
    assert!(!tool.lazy);
}

#[test]
fn test_tool_definition_needs_approval() {
    let def = tool_definition("deleteFile", "Delete a file").needs_approval(true);
    assert!(def.needs_approval);

    let tool = def.to_tool();
    assert!(tool.needs_approval);
}

#[test]
fn test_tool_definition_lazy() {
    let def = tool_definition("discoverableTool", "A lazy tool").lazy(true);
    assert!(def.lazy);

    let tool = def.to_tool();
    assert!(tool.lazy);
}

#[test]
fn test_tool_definition_metadata() {
    let def = tool_definition("customTool", "A custom tool")
        .metadata(serde_json::json!({"category": "utility"}));
    assert!(def.metadata.is_some());
}

#[test]
fn test_tool_definition_to_server_tool() {
    let def = tool_definition("compute", "Compute something");
    let tool = def.to_server_tool(|_args: serde_json::Value, _ctx| async move {
        Ok(serde_json::json!({"result": 42}))
    });
    assert_eq!(tool.name, "compute");
    assert!(tool.execute.is_some());
}

#[test]
fn test_tool_builder() {
    let tool = Tool::new("get_weather", "Get the weather")
        .with_input_schema(json_schema(serde_json::json!({
            "type": "object",
            "properties": { "location": { "type": "string" } },
            "required": ["location"]
        })))
        .with_approval();

    assert_eq!(tool.name, "get_weather");
    assert!(tool.needs_approval);
    assert!(tool.input_schema.is_some());
}

// ============================================================================
// Message Converter Tests
// ============================================================================

#[test]
fn test_ui_to_model_simple_text() {
    let ui_msg = UiMessage {
        id: "msg-1".to_string(),
        role: UiMessageRole::User,
        parts: vec![MessagePart::Text {
            content: "Hello".to_string(),
            metadata: None,
        }],
        created_at: None,
    };

    let model_msgs = ui_message_to_model_messages(&ui_msg);
    assert_eq!(model_msgs.len(), 1);
    assert_eq!(model_msgs[0].role, MessageRole::User);
    assert_eq!(model_msgs[0].content.as_str(), Some("Hello"));
}

#[test]
fn test_ui_to_model_multiple_text_parts() {
    let ui_msg = UiMessage {
        id: "msg-1".to_string(),
        role: UiMessageRole::User,
        parts: vec![
            MessagePart::Text {
                content: "Hello ".to_string(),
                metadata: None,
            },
            MessagePart::Text {
                content: "world!".to_string(),
                metadata: None,
            },
        ],
        created_at: None,
    };

    let model_msgs = ui_message_to_model_messages(&ui_msg);
    assert_eq!(model_msgs.len(), 1);
    // Multiple text parts are combined into MessageContent::Parts
    match &model_msgs[0].content {
        MessageContent::Parts(parts) => {
            assert_eq!(parts.len(), 2);
        }
        _ => panic!("Expected Parts content for multiple text parts"),
    }
}

#[test]
fn test_ui_to_model_thinking_part() {
    let ui_msg = UiMessage {
        id: "msg-1".to_string(),
        role: UiMessageRole::Assistant,
        parts: vec![MessagePart::Thinking {
            content: "reasoning".to_string(),
        }],
        created_at: None,
    };

    let model_msgs = ui_message_to_model_messages(&ui_msg);
    assert_eq!(model_msgs.len(), 1);
    assert_eq!(
        model_msgs[0].content.as_str(),
        Some("[thinking]reasoning[/thinking]"),
    );
}

#[test]
fn test_ui_to_model_multimodal_image() {
    let ui_msg = UiMessage {
        id: "msg-1".to_string(),
        role: UiMessageRole::User,
        parts: vec![
            MessagePart::Text {
                content: "What is in this image?".to_string(),
                metadata: None,
            },
            MessagePart::Image {
                source: ContentPartSource::Url {
                    value: "https://example.com/cat.jpg".to_string(),
                    mime_type: None,
                },
                metadata: None,
            },
        ],
        created_at: None,
    };

    let model_msgs = ui_message_to_model_messages(&ui_msg);
    assert_eq!(model_msgs.len(), 1);
    assert_eq!(model_msgs[0].role, MessageRole::User);
    match &model_msgs[0].content {
        MessageContent::Parts(parts) => {
            assert_eq!(parts.len(), 2);
            assert!(matches!(&parts[0], ContentPart::Text { .. }));
            assert!(matches!(&parts[1], ContentPart::Image { .. }));
        }
        _ => panic!("Expected Parts content"),
    }
}

#[test]
fn test_ui_to_model_multimodal_audio() {
    let ui_msg = UiMessage {
        id: "msg-1".to_string(),
        role: UiMessageRole::User,
        parts: vec![
            MessagePart::Text {
                content: "Transcribe this".to_string(),
                metadata: None,
            },
            MessagePart::Audio {
                source: ContentPartSource::Data {
                    value: "base64audio".to_string(),
                    mime_type: "audio/mp3".to_string(),
                },
                metadata: None,
            },
        ],
        created_at: None,
    };

    let model_msgs = ui_message_to_model_messages(&ui_msg);
    match &model_msgs[0].content {
        MessageContent::Parts(parts) => {
            assert_eq!(parts.len(), 2);
            assert!(matches!(&parts[1], ContentPart::Audio { .. }));
        }
        _ => panic!("Expected Parts content"),
    }
}

#[test]
fn test_model_to_ui_round_trip_text() {
    let model_msg = ModelMessage {
        role: MessageRole::Assistant,
        content: MessageContent::Text("Hi there!".to_string()),
        name: None,
        tool_calls: None,
        tool_call_id: None,
    };

    let ui_msg = model_message_to_ui_message(&model_msg);
    assert_eq!(ui_msg.role, UiMessageRole::Assistant);
    assert_eq!(ui_msg.parts.len(), 1);
    match &ui_msg.parts[0] {
        MessagePart::Text { content, .. } => assert_eq!(content, "Hi there!"),
        _ => panic!("Expected Text part"),
    }

    // Round-trip back
    let model_msgs = ui_message_to_model_messages(&ui_msg);
    assert_eq!(model_msgs.len(), 1);
    assert_eq!(model_msgs[0].content.as_str(), Some("Hi there!"));
}

#[test]
fn test_model_to_ui_with_tool_calls() {
    let model_msg = ModelMessage {
        role: MessageRole::Assistant,
        content: MessageContent::Null,
        name: None,
        tool_calls: Some(vec![ToolCall {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: ToolCallFunction {
                name: "getWeather".to_string(),
                arguments: "{\"city\":\"NYC\"}".to_string(),
            },
            provider_metadata: None,
        }]),
        tool_call_id: None,
    };

    let ui_msg = model_message_to_ui_message(&model_msg);
    assert_eq!(ui_msg.parts.len(), 1);
    match &ui_msg.parts[0] {
        MessagePart::ToolCall { id, name, .. } => {
            assert_eq!(id, "call_1");
            assert_eq!(name, "getWeather");
        }
        _ => panic!("Expected ToolCall part"),
    }
}

#[test]
fn test_model_messages_to_ui_messages_batch() {
    let messages = vec![
        ModelMessage {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        },
        ModelMessage {
            role: MessageRole::Assistant,
            content: MessageContent::Text("Hi!".to_string()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let ui_messages = model_messages_to_ui_messages(&messages);
    assert_eq!(ui_messages.len(), 2);
    assert_eq!(ui_messages[0].role, UiMessageRole::User);
    assert_eq!(ui_messages[1].role, UiMessageRole::Assistant);
}

// ============================================================================
// JSON Parser Tests
// ============================================================================

#[test]
fn test_parse_complete_json() {
    let result = tanstack_ai::stream::json_parser::parse_partial_json(r#"{"name": "test"}"#);
    assert!(result.is_some());
    assert_eq!(result.unwrap()["name"], "test");
}

#[test]
fn test_parse_partial_json_object() {
    let result = tanstack_ai::stream::json_parser::parse_partial_json(r#"{"name": "te"#);
    assert!(result.is_some());
    assert_eq!(result.unwrap()["name"], "te");
}

#[test]
fn test_parse_partial_json_array() {
    let result = tanstack_ai::stream::json_parser::parse_partial_json(r#"[1, 2, 3"#);
    assert!(result.is_some());
    assert_eq!(result.unwrap(), serde_json::json!([1, 2, 3]));
}

#[test]
fn test_parse_empty_string() {
    assert!(tanstack_ai::stream::json_parser::parse_partial_json("").is_none());
    assert!(tanstack_ai::stream::json_parser::parse_partial_json("   ").is_none());
}

#[test]
fn test_parse_nested_partial() {
    let result = tanstack_ai::stream::json_parser::parse_partial_json(r#"{"user": {"name": "Jo"#);
    assert!(result.is_some());
    assert_eq!(result.unwrap()["user"]["name"], "Jo");
}

// ============================================================================
// Stream Chunk Serialization Tests
// ============================================================================

#[test]
fn test_stream_chunk_serialization() {
    let chunk = StreamChunk::TextMessageContent {
        timestamp: 1234567890.0,
        message_id: "msg-123".to_string(),
        delta: "Hello".to_string(),
        content: None,
        model: Some("gpt-4o".to_string()),
    };

    let json = serde_json::to_string(&chunk).unwrap();
    assert!(json.contains("\"type\":\"TEXT_MESSAGE_CONTENT\""));
    assert!(json.contains("\"delta\":\"Hello\""));

    let deserialized: StreamChunk = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.event_type(), AguiEventType::TextMessageContent);
}

#[test]
fn test_stream_chunk_run_started() {
    let chunk = StreamChunk::RunStarted {
        timestamp: 1234567890.0,
        run_id: "run-1".to_string(),
        thread_id: None,
        model: Some("gpt-4o".to_string()),
    };

    let json = serde_json::to_string(&chunk).unwrap();
    assert!(json.contains("\"type\":\"RUN_STARTED\""));
    assert!(json.contains("\"runId\":\"run-1\""));

    let deserialized: StreamChunk = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.event_type(), AguiEventType::RunStarted);
}

#[test]
fn test_stream_chunk_tool_call_events() {
    let start = StreamChunk::ToolCallStart {
        timestamp: 0.0,
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        parent_message_id: None,
        index: Some(0),
        provider_metadata: None,
        model: None,
    };
    assert_eq!(start.event_type(), AguiEventType::ToolCallStart);

    let args = StreamChunk::ToolCallArgs {
        timestamp: 0.0,
        tool_call_id: "call_1".to_string(),
        delta: "{\"city\":".to_string(),
        args: None,
        model: None,
    };
    assert_eq!(args.event_type(), AguiEventType::ToolCallArgs);

    let end = StreamChunk::ToolCallEnd {
        timestamp: 0.0,
        tool_call_id: "call_1".to_string(),
        tool_name: "getWeather".to_string(),
        input: Some(serde_json::json!({"city": "NYC"})),
        result: Some("{\"temp\":72}".to_string()),
        model: None,
    };
    assert_eq!(end.event_type(), AguiEventType::ToolCallEnd);
}

#[test]
fn test_stream_chunk_run_finished_with_usage() {
    let chunk = StreamChunk::RunFinished {
        timestamp: 0.0,
        run_id: "run-1".to_string(),
        finish_reason: Some("stop".to_string()),
        usage: Some(Usage {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
        }),
        model: Some("gpt-4o".to_string()),
    };

    let json = serde_json::to_string(&chunk).unwrap();
    assert!(json.contains("\"finishReason\":\"stop\""));
    assert!(json.contains("\"promptTokens\":10"));

    let deserialized: StreamChunk = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.event_type(), AguiEventType::RunFinished);
}

#[test]
fn test_model_message_serialization() {
    let msg = ModelMessage {
        role: MessageRole::User,
        content: MessageContent::Text("Hello!".to_string()),
        name: None,
        tool_calls: None,
        tool_call_id: None,
    };

    let json = serde_json::to_string(&msg).unwrap();
    let deserialized: ModelMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.role, MessageRole::User);
    assert_eq!(deserialized.content.as_str(), Some("Hello!"));
}

#[test]
fn test_model_message_with_tool_calls() {
    let msg = ModelMessage {
        role: MessageRole::Assistant,
        content: MessageContent::Null,
        name: None,
        tool_calls: Some(vec![ToolCall {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: ToolCallFunction {
                name: "getWeather".to_string(),
                arguments: "{\"city\":\"NYC\"}".to_string(),
            },
            provider_metadata: None,
        }]),
        tool_call_id: None,
    };

    let json = serde_json::to_string(&msg).unwrap();
    let deserialized: ModelMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.role, MessageRole::Assistant);
    assert!(deserialized.tool_calls.is_some());
    assert_eq!(
        deserialized.tool_calls.as_ref().unwrap()[0].function.name,
        "getWeather"
    );
}

#[test]
fn test_detect_image_mime_type() {
    let png_header = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    assert_eq!(tanstack_ai::detect_image_mime_type(png_header), "image/png");

    let jpeg_header = &[0xFF, 0xD8, 0xFF, 0xE0];
    assert_eq!(
        tanstack_ai::detect_image_mime_type(jpeg_header),
        "image/jpeg"
    );
}

#[test]
fn test_json_schema_serializes_ref_and_defs_keys() {
    let schema = JsonSchema {
        r#ref: Some("#/$defs/thing".to_string()),
        defs: Some(std::collections::HashMap::from([(
            "thing".to_string(),
            JsonSchema {
                r#type: Some(serde_json::json!("string")),
                ..Default::default()
            },
        )])),
        ..Default::default()
    };

    let json = serde_json::to_value(schema).unwrap();
    assert_eq!(json["$ref"], "#/$defs/thing");
    assert!(json.get("$defs").is_some());
}
