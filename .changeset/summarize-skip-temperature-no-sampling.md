---
'@tanstack/ai-anthropic': patch
---

The Anthropic text adapter drops `temperature`, `top_p`, and `top_k` from the request on models that reject non-default sampling parameters. `anthropicSummarize()` on those models no longer sends the summarize default `temperature: 0.3`, so the request no longer fails with a 400.
