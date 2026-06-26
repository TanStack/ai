---
"@tanstack/ai-grok": patch
---

Remove `Record<string, unknown>` index signature from `GrokTextProviderOptions` so that `grokSummarize` adapters are assignable to `SummarizeAdapter<string, object>`. Under `strictFunctionTypes`, the index signature caused `object` to be un-assignable to `GrokTextProviderOptions` (contravariant parameter check), making `grokSummarize('grok-4.3')` a type error at every `summarize()` call site. All fields on `GrokTextProviderOptions` are explicitly typed optional members, so the index signature was unnecessary.
