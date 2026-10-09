---
'@tanstack/ai': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-llmgateway': patch
---

Text adapters can now give `inputModalities` at run time: the input kinds that the model reads, for example `['text', 'image', 'document']`. `undefined` means that the adapter does not know.

- `TextAdapter` has the new optional `inputModalities` property. A `BaseTextAdapter` subclass sets it from its model metadata.
- The text adapters of OpenAI, Anthropic, Gemini, Mistral, Groq, BytePlus, Grok, OpenRouter, and LLM Gateway set it. A known model gives its input kinds. An unknown model gives `undefined`.
