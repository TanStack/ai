---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openai': patch
'@tanstack/openai-base': patch
---

Remove model ids that providers have retired. Each one now fails on the provider's API, so the types no longer accept it.

- Groq: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `meta-llama/llama-4-maverick-17b-128e-instruct`, `meta-llama/llama-4-scout-17b-16e-instruct`, `meta-llama/llama-guard-4-12b`, `moonshotai/kimi-k2-instruct-0905`, `qwen/qwen3-32b`. Adds `qwen/qwen3.8-27b`.
- Mistral: `pixtral-large-latest`, `pixtral-12b-2409`, `open-mistral-nemo`.
- OpenAI: `chatgpt-4o-latest`, `codex-mini-latest`, `gpt-4o-audio`, `gpt-4o-mini-audio`, `gpt-5.6`, `dall-e-2`, `dall-e-3`, `computer-use-preview`. The speech model `gpt-4o-audio-preview` is replaced by `gpt-4o-mini-tts`.
- Anthropic: `claude-opus-4-1`, `claude-opus-5-fast`.
- Gemini: `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`.

Types and helpers that only served those models are removed:

- `@tanstack/ai-gemini`: `GeminiImageProviderOptions`, `GeminiAnyImageProviderOptions`, `GeminiAspectRatio`, `PersonGeneration`, `SafetyFilterLevel`, `ImagePromptLanguage`, `GEMINI_NATIVE_IMAGE_MODELS`, `isGeminiNativeImageModel`. Every Gemini image model uses `GeminiNativeImageProviderOptions`.
- `@tanstack/openai-base`: `OpenAIComputerToolName`. `resolveComputerUseTool(tool)` no longer takes a model.
- `@tanstack/ai-openai`: the dall-e option and size types.
