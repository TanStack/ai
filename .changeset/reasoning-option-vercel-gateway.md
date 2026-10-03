---
'@tanstack/ai-vercel-gateway': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `reasoning` and `include_reasoning` leave `modelOptions`. Chat Completions gets AI Gateway's `reasoning` object, and Responses gets `reasoning.effort`.
