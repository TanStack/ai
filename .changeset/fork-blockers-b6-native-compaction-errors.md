---
'@tanstack/ai-compaction': patch
'@tanstack/openai-base': patch
'@tanstack/ai': patch
---

Native compaction no longer fails without a report. When the adapter's `compact` fails, `onCompact` and `compaction:ended` get the failure in `error`, and the strategy runs. That adapter and model then use the strategy for the rest of the process. The compact request now sends the system prompts as `instructions`, and the tools. A compact result with no compaction item throws, so the strategy runs. `TextCompactOptions` gets the optional `systemPrompts` and `tools` fields.
