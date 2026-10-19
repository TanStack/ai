---
'@tanstack/ai-anthropic': minor
---

Add the `fallbacks` model option for Anthropic server-side refusal fallback. Set `modelOptions: { fallbacks: 'default' }` on `claude-fable-5`, `claude-fable-5-1`, `claude-opus-5`, `claude-opus-5-5` or `claude-sonnet-5-5`. When a safety classifier declines the request, the API answers with another model in the same call. The adapter sends the `server-side-fallback-2026-07-01` beta header for you.

A response with `stop_reason: "refusal"` now finishes with `finishReason: 'content_filter'`. Before, it finished with `'stop'`. The refusal `stop_details` (`category`, `explanation`) is on the `RUN_FINISHED` event as `rawEvent`.
