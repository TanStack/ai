---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
---

Keep the prompt cache when tools or system prompts are added during a conversation.

- Before each model call, `chat()` compares the tools and the system prompts with the earlier calls. On a model with a mid-conversation channel, an added tool, or a system prompt added at the end, goes out in the conversation. The start of the request stays the same.
- `openaiText` on `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol`: an added tool is an `additional_tools` input item, and an added prompt is a `developer` message. The Responses adapter of `@tanstack/openai-base` sends these when a subclass sets `midConversationChannels`.
- `anthropicText` on `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-fable-5`, and `claude-fable-5-1`: every request with tools has the `mid-conversation-tool-changes-2026-07-01` beta and one placeholder tool, unless a provider tool such as `webSearchTool()` takes part. An added tool has `defer_loading: true` and a `tool_addition` block in a `system` message.
- Every other model and adapter sends the same request as before.
- The channels are on by default only with the provider's own API. A custom `baseURL`, a custom `fetch`, an injected client, or the `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` environment variable turns the default off. Set `midConversationChannels: true` to turn the channels on anyway. Set `false` to turn them off anywhere.
- With prompt caching on (the default), the automatic Claude tool cache marker goes on the last start tool, not on the placeholder or an added tool.
- New optional fields: `ModelMessage.midConversationChange`, `TextOptions.midConversationChanges`, and `TextAdapter.midConversationChannels`, with the types `MidConversationChange`, `MidConversationChanges`, and `MidConversationChannels`. `splitMidConversationChanges` helps adapter authors read the changes.
