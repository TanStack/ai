---
'@tanstack/ai': minor
'@tanstack/ai-openrouter': minor
---

Text adapters can carry `defaultModelOptions`. `chat()` merges them under the `modelOptions` of each call, one level deep. A key that the call sets replaces the default key in full. The engine, the middleware, and the adapter all get the merged value.

`createOpenRouterText()`, `openRouterText()`, `createOpenRouterResponsesText()`, and `openRouterResponsesText()` take a `defaultModelOptions` option, for example to set provider routing for every call:

```ts
const adapter = openRouterText('openai/gpt-5.5', {
  defaultModelOptions: {
    provider: { sort: 'latency', preferredMaxLatency: { p90: 2.5 } },
  },
})
```
