---
'@tanstack/ai-openrouter': patch
---

Keep optional tool fields optional. The Chat Completions adapter now sends function tools with `strict: false`. With `strict` omitted, OpenAI models through OpenRouter were observed to treat the schema as strict and make every optional field required, so before this fix the model could not leave one out. The Responses adapter now strips the `null` that strict mode puts in an omitted optional field before the tool input is validated, so the tool runs and sees the field as absent. A `.nullable()` field keeps its `null`. Known limit: an optional field inside a union of several object shapes is not stripped and still arrives as `null`.
