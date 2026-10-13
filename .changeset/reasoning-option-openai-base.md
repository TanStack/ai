---
'@tanstack/openai-base': minor
---

The Chat Completions and Responses base adapters support `chat({ reasoning })`.

- They take a new last type parameter for the reasoning levels.
- A subclass returns the model's reasoning data from the new protected `modelReasoning(model)` hook.
- The Chat Completions base then sends `reasoning_effort`. The Responses base sends `reasoning: { effort, summary }`.
- The default hook returns nothing, so a subclass that does not override it sends the same request as before.

Breaking: none.
