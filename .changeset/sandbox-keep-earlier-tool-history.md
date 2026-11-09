---
'@tanstack/ai-sandbox': patch
---

Keep the harness tool calls of earlier runs in a saved thread. Before, `withSandbox` removed them from the chat transcript instead of only from the model request, so with `withPersistence` each run's save dropped the tool calls of the runs before it, and a reload showed those runs without their tool cards.
