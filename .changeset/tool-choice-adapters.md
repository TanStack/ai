---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openrouter': patch
---

Send `chat({ toolChoice })` to each provider.

- **Anthropic and Bedrock Converse.** Claude Fable 5.1, Mythos 5.1, Opus 5.5, and Sonnet 5.5 reject a forced tool, and every Claude model rejects one while thinking is on. On those, `'required'` and a named tool fall back to `auto`.
- **Bedrock Converse** has no `none`. `'none'` sends no tool config, except after tool calls in the history: then it sends the tools with `auto`, because Bedrock needs a tool config there.
- **Gemini** maps the choice to `functionCallingConfig` (`AUTO`, `NONE`, `ANY`, and `allowedFunctionNames`). With only provider tools, such as Google Search, it sends no tool config.
- **Grok, Mistral, and OpenRouter** (Chat Completions and Responses) send their own `tool_choice` shape.
