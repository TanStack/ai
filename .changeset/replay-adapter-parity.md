---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/openai-base': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-persistence': patch
---

Keep a conversation valid when the next request goes to a different model.

- Each assistant message records `metadata.tanstack.source` (`{ provider, api, model }`), and `responseId` and the resolved `model` when the provider sends them. A failed or aborted answer gets `stopReason: 'error'` or `'aborted'`. `RUN_FINISHED` has a new `responseId` field. `TextAdapter` has new optional `provider` and `api` fields.
- When the next request goes to a different source, the adapter removes signatures and redacted thinking, turns readable thinking into text, and rewrites tool call IDs to the shape the target API accepts. Each call stays paired with its result.
- Every request drops failed and aborted assistant batches and adds a `No result provided` result for an unanswered tool call. The saved history does not change.
- `RUN_FINISHED` and `RUN_ERROR` metadata now merge onto the assistant messages of that model call in `StreamProcessor`.
- Anthropic: the new `allowEmptySignature` option (default `false`) replays unsigned thinking from the same source, for gateways. The new `provider` option names a gateway.
- Azure OpenAI reports the `azure-openai-responses` API.
- Gemini, Mistral, and Bedrock Converse send same-source thinking back to the model, in block order.
- `withPersistence` writes the source and the stop reason onto streaming snapshot rows.
- Adapter authors get `transformMessagesForReplay()` and `hashToolCallId()` from `@tanstack/ai/adapter-internals`.
