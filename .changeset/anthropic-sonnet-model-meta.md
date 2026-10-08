---
'@tanstack/ai-anthropic': patch
---

Correct the `claude-sonnet-5-5` and `claude-sonnet-5` model metadata: neither supports Priority Tier, `claude-sonnet-5-5` cache reads cost $0.10 per MTok, and `claude-sonnet-5` is priced at the standard $2 / $10 per MTok.
