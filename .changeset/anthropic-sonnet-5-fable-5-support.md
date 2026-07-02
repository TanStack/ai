---
'@tanstack/ai-anthropic': minor
---

Add first-class support for Claude Sonnet 5 (`claude-sonnet-5`) and Claude Fable 5 (`claude-fable-5`), and clean up the model registry so every registered id resolves against the first-party Anthropic API.

**New model support.** Both 5-generation models carry accurate metadata (adaptive thinking, sticker pricing for Sonnet 5) and per-model provider-option types that match the API: adaptive-only `thinking` on Fable 5 (explicit `disabled` and `budget_tokens` are rejected), adaptive-or-disabled `thinking` on Sonnet 5, and no `temperature` / `top_p` / `top_k` on either. `output_config.effort` gains the `'xhigh'` level. Both models (plus Opus 4.8) are registered for native combined tools + output-schema requests. Closes #880.

**Corrected ids (breaking).** `claude-opus-4.8` is now `claude-opus-4-8` — the dot spelling came from an OpenRouter metadata sync and returns 404 on the Anthropic API. Opus 4.7 and 4.8 also get correct per-model types (adaptive thinking, no `budget_tokens`, no sampling parameters) and Opus/Sonnet 4.6 now accept `thinking: { type: 'adaptive' }`.

**Removed retired models (breaking).** The following ids no longer resolve on the Anthropic API (verified live) and were removed from `ANTHROPIC_MODELS`: `claude-3-7-sonnet`, `claude-3-5-haiku`, `claude-3-haiku`, `claude-opus-4`, `claude-sonnet-4`, and the `claude-opus-4-6-fast` / `claude-opus-4-7-fast` / `claude-opus-4.8-fast` variants (fast mode is requested via the `speed` parameter, not a model id). If you were pinning one of these, migrate to a current model (`claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-4-8`).
