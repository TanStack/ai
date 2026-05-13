---
'@tanstack/ai-openrouter': patch
---

Internal: drop the remaining duck-typed `as { ... }` casts on stream chunks in `OpenRouterResponsesTextAdapter`. Five sites (`response.created/in_progress/incomplete/failed` model + error capture, `response.content_part.added/done` payload, and the `response.completed` function-call detection) now narrow via the SDK's discriminated unions directly. Behaviourally identical; reduces the chance of a SDK type rename silently slipping past us.
