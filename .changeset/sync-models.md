---
'@tanstack/ai-openrouter': patch
---

Update model metadata from OpenRouter API

Releases the model-metadata syncs from #772 and #883 that were generated
without a changeset: adds Claude Sonnet 5 (`anthropic/claude-sonnet-5`),
Claude Fable 5 (`anthropic/claude-fable-5`), DeepSeek V3.2, GLM-5.2,
Kimi K2.7 Code, Qwen 3.7 Plus, Nemotron 3 Ultra, and other new models;
refreshes pricing and capability flags; and removes ids retired upstream
(e.g. `anthropic/claude-3.5-haiku`, `anthropic/claude-opus-4.6-fast`).
