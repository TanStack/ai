---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-cloudflare': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-openrouter': minor
---

Text adapters now set one stable code on `RUN_ERROR` when the input does not fit in the model's context window: `code: 'context_overflow'`. `@tanstack/ai` exports it as `CONTEXT_OVERFLOW_CODE`. The provider's own text stays in `message`.

```ts
if (chunk.type === 'RUN_ERROR' && chunk.code === CONTEXT_OVERFLOW_CODE) {
  // shorten the messages, then call chat() again
}
```

These adapters set it: OpenAI and the other OpenAI-compatible adapters (from `code: 'context_length_exceeded'`), Anthropic, Gemini, Bedrock (Converse, Chat Completions, and Responses), OpenRouter, Grok, Cloudflare Workers AI, and BytePlus.

Changes to code that reads the old values:

- OpenAI-compatible adapters gave `code: 'context_length_exceeded'`. They now give `'context_overflow'`. `rawEvent` still has the provider's code.
- Anthropic, Grok, OpenRouter, and BytePlus gave the HTTP status or a general bad-request code for this error. Gemini and Bedrock Converse gave no code.
- The Anthropic adapter now sends `RUN_ERROR` with this code when the model stops with `stop_reason: 'model_context_window_exceeded'`. Before, it sent `RUN_FINISHED` with `finishReason: 'stop'`, so a cut-off answer looked complete.
