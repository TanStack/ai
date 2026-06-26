---
'@tanstack/ai-grok': patch
---

Fix `grokSummarize`/`createGrokSummarize` not being assignable to `summarize()`'s
`adapter` param for any current Grok model (`grok-4.3`, `grok-build-0.1`).

`GrokTextProviderOptions` was declared as an `interface` extending
`Record<string, unknown>`, giving it an explicit index signature. Under
`strictFunctionTypes`, the `SummarizeAdapter` constraint is checked
contravariantly, which requires `object` to be assignable to the provider
options — but `object` is not assignable to an index-signature type, so the
check failed (Grok-only; OpenAI's all-optional, no-index-signature options
passed). The options are now a type-alias intersection matching the OpenAI
shape, and the text adapter's provider-options constraint is widened to
`Record<string, any>` to mirror `OpenAITextAdapter`.
