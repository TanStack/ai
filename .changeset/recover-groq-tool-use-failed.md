---
'@tanstack/ai': patch
'@tanstack/openai-base': patch
'@tanstack/ai-groq': patch
---

Return recoverable Groq `tool_use_failed` responses to the model as non-executable tool errors so the agent loop can repair them.
