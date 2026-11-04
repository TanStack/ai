---
'@tanstack/ai': patch
'@tanstack/ai-event-client': patch
'@tanstack/openai-base': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-cloudflare': patch
'@tanstack/ai-lovable': patch
'@tanstack/ai-claude-code': patch
'@tanstack/ai-codex': patch
'@tanstack/ai-opencode': patch
'@tanstack/ai-acp': patch
'@tanstack/ai-grok-build': patch
'@tanstack/ai-harness': patch
---

Report token usage for every call that the provider billed, also when the call fails.

- Adapters put the usage that they received on `RUN_ERROR`: a cut-off response, a refusal, a parse failure, an empty response, or a stream that fails after usage arrived. Before, many of these paths dropped it.
- A non-streaming `structuredOutput()`, image, or speech call that fails after the response throws an error with a `usage` field. `chat()`, `generateImage()`, `generateSpeech()`, and `summarize()` report it.
- The `onUsage` middleware hook now also runs for a `RUN_ERROR` with usage. A structured output value that fails the schema check still reports the usage of its call.
- Media streams carry `usage` on `RUN_FINISHED` and `RUN_ERROR`. Devtools now gets the `summarize:usage` and `transcription:usage` events, and `text:usage` for a chat `RUN_ERROR` with usage. A call that `onModelError` or a rate-limit retry drops still reports its usage.
- Provider fields that were dropped are mapped: Anthropic thinking tokens, Claude Code `total_cost_usd` as `usage.cost`, OpenRouter Responses reasoning tokens, opencode cost and cache writes, ACP and Bedrock cache writes, OpenAI evaluate token details, Gemini Vertex embedding tokens, and audio duration as billed seconds for Whisper, Groq, Cloudflare, and Lovable transcription.
- opencode adds up the usage of every agent step in a turn. Before, it counted only the last step.
- Gemini Interactions usage (text, agentic video, and images) counts thought tokens in `completionTokens`, the same as `generateContent`.
