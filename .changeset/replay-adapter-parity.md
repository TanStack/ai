---
'@tanstack/ai': minor
'@tanstack/ai-utils': patch
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/openai-base': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-persistence': patch
'@tanstack/ai-harness': patch
---

Record assistant and run source metadata, provider generation IDs, and reported response models. Preserve metadata through saved history and prepare valid requests when a conversation switches providers or APIs. Clean failed turns and unanswered tool calls without changing the saved transcript.

Validate final tool input after middleware. Coerce raw JSON Schema arguments and return tool errors for invalid input. Preserve authored Standard Schema transforms and raw provider arguments. Check approval and client-output resume bindings, and preserve JSON-compatible approved edits across resume.

Keep pending harness interrupts available after a rejected resume response, so a valid response can retry. Preserve stored approval bindings across client-output phases.

Add Azure OpenAI Responses support and Anthropic Bearer/OAuth authentication. Add an option to replay unsigned thinking through Anthropic-protocol gateways.

Preserve ordered thinking replay and tool-result images where providers support them. Send Bedrock tool error status, reject invalid Chat Completions content and unknown finish reasons, remove lone Unicode surrogates from outgoing text, and include an empty tools list when tool history requires it.

Update BytePlus's adapter comments to describe source-aware signature replay through the shared adapter.
