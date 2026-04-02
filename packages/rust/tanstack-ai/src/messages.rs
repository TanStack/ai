use crate::types::*;

/// Generate a unique message ID.
pub fn generate_message_id(prefix: &str) -> String {
    format!(
        "{}-{}-{}",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        &uuid::Uuid::new_v4().to_string()[..8]
    )
}

/// Convert UI messages to model messages.
///
/// Handles the conversion of UIMessage format (with parts) to ModelMessage
/// format (with content/toolCalls) that is sent to providers.
pub fn ui_messages_to_model_messages(ui_messages: &[UiMessage]) -> Vec<ModelMessage> {
    ui_messages
        .iter()
        .flat_map(ui_message_to_model_messages)
        .collect()
}

/// Convert a single UI message to one or more model messages.
pub fn ui_message_to_model_messages(ui_msg: &UiMessage) -> Vec<ModelMessage> {
    let role = match ui_msg.role {
        UiMessageRole::System => MessageRole::System,
        UiMessageRole::User => MessageRole::User,
        UiMessageRole::Assistant => MessageRole::Assistant,
    };

    match role {
        MessageRole::System | MessageRole::User => {
            // Collect text parts into a single message
            let content_parts: Vec<ContentPart> = ui_msg
                .parts
                .iter()
                .filter_map(|part| match part {
                    MessagePart::Text { content, .. } => Some(ContentPart::Text {
                        content: content.clone(),
                    }),
                    MessagePart::Image { source, .. } => Some(ContentPart::Image {
                        source: source.clone(),
                    }),
                    MessagePart::Audio { source, .. } => Some(ContentPart::Audio {
                        source: source.clone(),
                    }),
                    _ => None,
                })
                .collect();

            if content_parts.is_empty() {
                vec![ModelMessage {
                    role,
                    content: MessageContent::Null,
                    name: None,
                    tool_calls: None,
                    tool_call_id: None,
                }]
            } else if content_parts.len() == 1 {
                if let ContentPart::Text { content } = &content_parts[0] {
                    vec![ModelMessage {
                        role,
                        content: MessageContent::Text(content.clone()),
                        name: None,
                        tool_calls: None,
                        tool_call_id: None,
                    }]
                } else {
                    vec![ModelMessage {
                        role,
                        content: MessageContent::Parts(content_parts),
                        name: None,
                        tool_calls: None,
                        tool_call_id: None,
                    }]
                }
            } else {
                vec![ModelMessage {
                    role,
                    content: MessageContent::Parts(content_parts),
                    name: None,
                    tool_calls: None,
                    tool_call_id: None,
                }]
            }
        }

        MessageRole::Assistant => {
            let mut messages = Vec::new();
            let mut text_content = String::new();
            let mut tool_calls = Vec::new();

            for part in &ui_msg.parts {
                match part {
                    MessagePart::Text { content, .. } => {
                        text_content.push_str(content);
                    }
                    MessagePart::Thinking { content } => {
                        // Thinking parts are included as text with a marker
                        text_content.push_str(&format!("[thinking]{}[/thinking]", content));
                    }
                    MessagePart::ToolCall {
                        id,
                        name,
                        arguments,
                        ..
                    } => {
                        tool_calls.push(ToolCall {
                            id: id.clone(),
                            call_type: "function".to_string(),
                            function: ToolCallFunction {
                                name: name.clone(),
                                arguments: arguments.clone(),
                            },
                            provider_metadata: None,
                        });
                    }
                    MessagePart::ToolResult {
                        tool_call_id,
                        content,
                        state: _,
                        error,
                        ..
                    } => {
                        // Tool results are separate messages with role=tool
                        let result_content = if let Some(err) = error {
                            serde_json::json!({"error": err}).to_string()
                        } else {
                            content.clone()
                        };

                        messages.push(ModelMessage {
                            role: MessageRole::Tool,
                            content: MessageContent::Text(result_content),
                            name: None,
                            tool_calls: None,
                            tool_call_id: Some(tool_call_id.clone()),
                        });
                    }
                    _ => {}
                }
            }

            // Create the assistant message
            let content = if text_content.is_empty() {
                MessageContent::Null
            } else {
                MessageContent::Text(text_content)
            };

            messages.insert(
                0,
                ModelMessage {
                    role: MessageRole::Assistant,
                    content,
                    name: None,
                    tool_calls: if tool_calls.is_empty() {
                        None
                    } else {
                        Some(tool_calls)
                    },
                    tool_call_id: None,
                },
            );

            messages
        }

        MessageRole::Tool => {
            // UI messages never have Tool role — this is unreachable
            unreachable!("Tool role should not appear in UI messages")
        }
    }
}

/// Convert model messages back to UI messages.
pub fn model_messages_to_ui_messages(messages: &[ModelMessage]) -> Vec<UiMessage> {
    messages.iter().map(model_message_to_ui_message).collect()
}

/// Convert a model message to a UI message.
pub fn model_message_to_ui_message(msg: &ModelMessage) -> UiMessage {
    let role = match msg.role {
        MessageRole::System => UiMessageRole::System,
        MessageRole::User => UiMessageRole::User,
        MessageRole::Assistant | MessageRole::Tool => UiMessageRole::Assistant,
    };

    let mut parts = Vec::new();

    // Add content parts
    match &msg.content {
        MessageContent::Text(text) => {
            parts.push(MessagePart::Text {
                content: text.clone(),
                metadata: None,
            });
        }
        MessageContent::Parts(content_parts) => {
            for part in content_parts {
                match part {
                    ContentPart::Text { content } => {
                        parts.push(MessagePart::Text {
                            content: content.clone(),
                            metadata: None,
                        });
                    }
                    ContentPart::Image { source } => {
                        parts.push(MessagePart::Image {
                            source: source.clone(),
                            metadata: None,
                        });
                    }
                    ContentPart::Audio { source } => {
                        parts.push(MessagePart::Audio {
                            source: source.clone(),
                            metadata: None,
                        });
                    }
                    ContentPart::Video { source } => {
                        parts.push(MessagePart::Video {
                            source: source.clone(),
                            metadata: None,
                        });
                    }
                    ContentPart::Document { source } => {
                        parts.push(MessagePart::Document {
                            source: source.clone(),
                            metadata: None,
                        });
                    }
                }
            }
        }
        MessageContent::Null => {}
    }

    // Add tool call parts
    if let Some(tool_calls) = &msg.tool_calls {
        for tc in tool_calls {
            parts.push(MessagePart::ToolCall {
                id: tc.id.clone(),
                name: tc.function.name.clone(),
                arguments: tc.function.arguments.clone(),
                state: ToolCallState::InputComplete,
                approval: None,
                output: None,
            });
        }
    }

    // Add tool result parts
    if msg.role == MessageRole::Tool {
        if let Some(tool_call_id) = &msg.tool_call_id {
            let content_str = match &msg.content {
                MessageContent::Text(s) => s.clone(),
                _ => String::new(),
            };
            parts.push(MessagePart::ToolResult {
                tool_call_id: tool_call_id.clone(),
                content: content_str,
                state: ToolResultState::Complete,
                error: None,
            });
        }
    }

    UiMessage {
        id: generate_message_id("msg"),
        role,
        parts,
        created_at: Some(chrono::Utc::now()),
    }
}

/// Normalize messages to ModelMessage format.
/// If the messages are already ModelMessages, pass through.
/// If they are UI messages, convert them.
pub fn normalize_to_model_messages(messages: &[ModelMessage]) -> Vec<ModelMessage> {
    messages.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_to_model_text() {
        let ui_msg = UiMessage {
            id: "test-1".to_string(),
            role: UiMessageRole::User,
            parts: vec![MessagePart::Text {
                content: "Hello!".to_string(),
                metadata: None,
            }],
            created_at: None,
        };

        let model_msgs = ui_message_to_model_messages(&ui_msg);
        assert_eq!(model_msgs.len(), 1);
        assert_eq!(model_msgs[0].role, MessageRole::User);
        assert_eq!(model_msgs[0].content.as_str(), Some("Hello!"));
    }

    #[test]
    fn test_model_to_ui_round_trip() {
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

        let model_msgs = ui_message_to_model_messages(&ui_msg);
        assert_eq!(model_msgs.len(), 1);
        assert_eq!(model_msgs[0].content.as_str(), Some("Hi there!"));
    }
}
