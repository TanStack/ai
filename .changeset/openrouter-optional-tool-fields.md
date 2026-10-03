---
'@tanstack/ai-openrouter': patch
---

Keep optional tool fields optional. The Chat Completions adapter now sends function tools with `strict: false`. OpenRouter serves OpenAI models through the upstream Responses API, where an omitted `strict` forces every optional field, so before this fix the model could not leave one out. The Responses adapter now strips the `null` that strict mode puts in an omitted optional field before the tool input is validated, so the tool runs and sees the field as absent. A `.nullable()` field keeps its `null`.
