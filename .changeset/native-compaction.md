---
'@tanstack/ai': minor
'@tanstack/ai-compaction': minor
'@tanstack/openai-base': minor
---

A text adapter can now have an optional `compact(options)` method. It sends the history to the provider's own compaction endpoint, and resolves to the history for the next calls. The options are `TextCompactOptions`: `messages`, `model`, `signal`, `wrapFetch`, `systemPrompts`, and `tools`.

The OpenAI Responses adapters implement `compact` with `POST /responses/compact`. The request sends the system prompts as `instructions`, and the tools. The encrypted `compaction` item goes back to the same model as it is on later requests. A compact result with no compaction item throws.

`withCompaction` has a new `native` option. Pass the adapter of the `chat()` call. When the adapter has `compact`, it runs in place of `strategy`. When `compact` fails, `strategy` runs, and `onCompact` and `compaction:ended` get the failure in `error`. That adapter and model then use the strategy for the rest of the process. Without the option, nothing changes.
