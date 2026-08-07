package main

import (
	"encoding/json"
	"strings"
)

func textFromMessage(msg incomingMessage) string {
	if len(msg.Parts) > 0 {
		var parts []string
		for _, part := range msg.Parts {
			if part.Type == "text" && part.Content != "" {
				parts = append(parts, part.Content)
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "")
		}
	}

	if len(msg.Content) == 0 {
		return ""
	}

	var asString string
	if err := json.Unmarshal(msg.Content, &asString); err == nil {
		return asString
	}

	var asArray []map[string]any
	if err := json.Unmarshal(msg.Content, &asArray); err == nil {
		var parts []string
		for _, item := range asArray {
			if item["type"] == "text" {
				if text, ok := item["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "")
	}

	return strings.TrimSpace(string(msg.Content))
}

func toChatMessages(messages []incomingMessage) (system string, chat []chatMessage) {
	for _, msg := range messages {
		role := msg.Role
		switch role {
		case "developer":
			role = "system"
		case "tool", "reasoning":
			continue
		}

		text := textFromMessage(msg)
		if text == "" {
			continue
		}

		switch role {
		case "system":
			if system != "" {
				system += "\n\n"
			}
			system += text
		case "user", "assistant":
			chat = append(chat, chatMessage{Role: role, Content: text})
		}
	}

	return system, chat
}
