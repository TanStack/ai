---
'@tanstack/ai-anthropic': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `thinking`, `effort`, and `output_config.effort` leave `modelOptions`, with their option types. Claude 4.7 and later get adaptive thinking with `output_config.effort`, Claude 4.6 gets adaptive thinking with `effort`, older models get a thinking token budget, and `off` disables thinking.
