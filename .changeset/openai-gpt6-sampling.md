---
'@tanstack/ai-openai': patch
---

Drop `temperature` and `top_p` on GPT-6 reasoning models, and request encrypted reasoning for those models. OpenAI returns 400 when either sampling field is sent.
