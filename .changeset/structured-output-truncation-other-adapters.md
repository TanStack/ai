---
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-bedrock': patch
---

Report a structured-output response cut off at the output token limit as truncation instead of a JSON parse or schema error, as `openai-base` and `ai-openrouter` already do (#1426).
