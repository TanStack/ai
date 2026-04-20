---
'@tanstack/ai-openai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': patch
---

Wire each adapter's text, summarize, image, speech, transcription, and video paths through the new `InternalLogger` from `@tanstack/ai/adapter-internals`: `logger.request(...)` before each SDK call, `logger.provider(...)` for every chunk received, and `logger.errors(...)` in catch blocks. Migrates all pre-existing ad-hoc `console.*` calls in adapter catch blocks (including the OpenAI and ElevenLabs realtime adapters) onto the structured logger. No adapter factory or config-shape changes.
