---
'@tanstack/ai-grok': minor
---

Set reasoning with `chat({ reasoning })`.

- The adapter sends the level as `reasoning.effort`, with a summary.
- Each chat model has its reasoning data in `model-meta.ts`. `GrokModelReasoningByName` and `GROK_MODEL_REASONING` come from it. `grok-build-0.1` takes no `reasoning`, because the xAI API refuses it.

Breaking: `reasoning` is no longer in `modelOptions`. `GrokReasoning`, `GrokReasoningEffort`, and `GrokBuildProviderOptions` are removed.

```ts
// Before
chat({
  adapter: grokText('grok-4.3'),
  messages,
  modelOptions: { reasoning: { effort: 'high' } },
})

// After
chat({ adapter: grokText('grok-4.3'), messages, reasoning: 'high' })
```
