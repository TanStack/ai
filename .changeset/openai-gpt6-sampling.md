---
'@tanstack/ai-openai': patch
---

Drop `temperature`, `top_p`, and `top_logprobs` on GPT-6 reasoning models, and request encrypted reasoning for those models. OpenAI returns 400 when these fields are sent. They are kept when reasoning effort is `none`, which OpenAI accepts.
