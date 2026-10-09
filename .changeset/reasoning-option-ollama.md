---
'@tanstack/ai-ollama': minor
---

Set thinking with `chat({ reasoning })`.

- The adapter sends `think`: `true` or `false` for on/off models, and the level name for gpt-oss.
- A model name that the package does not list gets the on/off toggle, so a custom model keeps a switch. A listed model with no reasoning data sends nothing.
- Each model has its reasoning data in its family meta file. `OllamaModelReasoningByName` and `OLLAMA_MODEL_REASONING` collect it.

Breaking: `think` is no longer in `modelOptions`.

```ts
// Before
chat({
  adapter: ollamaText('qwen3:8b'),
  messages,
  modelOptions: { think: true },
})

// After
chat({ adapter: ollamaText('qwen3:8b'), messages, reasoning: 'high' })
```
