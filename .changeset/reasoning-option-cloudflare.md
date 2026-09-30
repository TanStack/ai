---
'@tanstack/ai-cloudflare': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning_effort` is removed; `off` sends `null`. `chat_template_kwargs` stays in `modelOptions`.
