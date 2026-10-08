---
'@tanstack/ai': minor
---

Add `isContextOverflow({ error, usage, finishReason, contextWindow, provider })`. It tells you that a model call failed, or ended early, because the input did not fit in the model's context window, so you can compact the history and retry.

- It knows the overflow error messages of about 25 providers (Anthropic, OpenAI, Gemini, Bedrock, Mistral, xAI, Groq, OpenRouter, Ollama, and more), and it ignores rate-limit and throttle errors.
- With `contextWindow`, it also finds a silent overflow (the input is bigger than the window) and a length stop with no output and a full window.
