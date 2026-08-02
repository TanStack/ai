use crate::agui::{ChatMessage, IncomingMessage};

pub fn to_chat_messages(messages: &[IncomingMessage]) -> (String, Vec<ChatMessage>) {
    let mut system = String::new();
    let mut chat = Vec::new();

    for message in messages {
        let mut role = message.role.as_str();
        match role {
            "developer" => role = "system",
            "tool" | "reasoning" => continue,
            _ => {}
        }

        let text = text_from_message(message);
        if text.is_empty() {
            continue;
        }

        match role {
            "system" => {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(&text);
            }
            "user" | "assistant" => chat.push(ChatMessage {
                role: role.to_string(),
                content: text,
            }),
            _ => {}
        }
    }

    (system, chat)
}

fn text_from_message(message: &IncomingMessage) -> String {
    if let Some(parts) = &message.parts {
        let joined = parts
            .iter()
            .filter(|part| part.part_type == "text")
            .filter_map(|part| part.content.as_deref())
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return joined;
        }
    }

    let Some(content) = &message.content else {
        return String::new();
    };

    if let Some(text) = content.as_str() {
        return text.to_string();
    }

    if let Some(items) = content.as_array() {
        let joined = items
            .iter()
            .filter_map(|item| {
                if item.get("type")?.as_str()? == "text" {
                    item.get("text")?.as_str().map(str::to_string)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return joined;
        }
    }

    content.to_string()
}
