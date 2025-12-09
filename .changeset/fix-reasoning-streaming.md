---
'@tanstack/ai-openai': patch
---

Fix reasoning token streaming for `gpt-5-mini` and `gpt-5-nano` models

- Added `OpenAIReasoningOptions` to type definitions for `gpt-5-mini` and `gpt-5-nano` models
- Fixed `summary` option placement in `OpenAIReasoningOptions` (moved inside `reasoning` object to match OpenAI SDK)
- Added handler for `response.reasoning_summary_text.delta` events to stream reasoning summaries
- Added model-specific `reasoning.summary` types: `concise` only available for `computer-use-preview`
- Added `OpenAIReasoningOptionsWithConcise` for `computer-use-preview` model
