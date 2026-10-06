---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-models': minor
---

Send the Anthropic thinking shape that the model record gives.

- `ModelReasoning.adaptive`: `true` sends adaptive thinking with the effort, `false` sends budget thinking. Without it, the adapter picks from the model id, as before. Adaptive thinking without a level map now sends pi's default effort (`minimal` and `low` give `low`, `medium` gives `medium`, the rest give `high`).
- `ModelReasoning.midConversationEffort`: the level goes into the messages as an effort `system` message, with `block_binding`, a fixed `output_config.effort: 'high'`, and the `mid-conversation-output-config-2026-07-01` and `thinking-binding-controls-2026-08-01` betas. Each answer keeps its level in `metadata.tanstack.reasoningEffort`, so a level change keeps the cached start.
- `midConversationChannels` takes `{ tools?: boolean; systemPrompts?: boolean }` to turn on one channel only.

`modelReasoning(record)` sets `adaptive` from `compat.forceAdaptiveThinking` and `midConversationEffort` from the new `compat.supportsMidConvoEffort` for `anthropic-messages` records. The catalog flags now equal pi's: Claude 4.6 and later think adaptively on every provider (also with dot ids such as `anthropic/claude-opus-4.7`), and the other Vercel AI Gateway models think with a budget.
