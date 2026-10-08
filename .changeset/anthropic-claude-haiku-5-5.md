---
'@tanstack/ai-anthropic': patch
---

Add `claude-haiku-5-5` to `ANTHROPIC_MODELS`. The model takes adaptive thinking (or an explicit `thinking: { type: 'disabled' }`) and `output_config.effort`, and its types reject `budget_tokens`, the sampling parameters, and `computerUseTool()`.
