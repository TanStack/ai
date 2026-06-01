---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/openai-base': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
---

feat: support multimodal (image) tool results

Tools may now return an `Array<ContentPart>` (e.g. a text part plus an image part) and have it transmitted to the model as structured multimodal tool output instead of a `JSON.stringify`'d blob. This unblocks use cases like returning a screenshot from a tool so the model can see it (issue #363).

- Detection is structural and opt-in by shape: a tool that returns a non-empty array whose every element is a valid `ContentPart` is passed through unchanged; strings and all other return values are serialized exactly as before, so there are no breaking changes.
- The OpenAI Responses, Anthropic, and Google Gemini adapters convert the content parts into their native multimodal tool-output formats (`function_call_output.output`, `tool_result` content blocks, and `functionResponse.parts` respectively). Providers on the Chat Completions path (Groq, Ollama, Grok, OpenRouter chat) fall back to stringifying, which their APIs require.
- AG-UI stream events (`TOOL_CALL_RESULT.content`, `TOOL_CALL_END.result`) remain string-only per the spec; the multimodal array travels on the tool message itself.
