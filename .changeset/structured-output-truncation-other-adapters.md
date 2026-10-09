---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-bedrock': patch
---

Structured output now reports a truncation error when the response stops at the output token limit. Before, you got a JSON parse error, or the partial result came back as valid data. `openai-base` and `ai-openrouter` already do this (#1426).
