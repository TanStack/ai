---
'@tanstack/ai-anthropic': patch
---

Give `claude-sonnet-5-5` and `claude-haiku-5-5` their mid-conversation channels. Anthropic supports mid-conversation system messages and tool changes on both models, but they were missing from `ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS`, so a tool or system prompt added during a conversation rewrote the start of the request and missed the prompt cache, even with `midConversationChannels: true`.
