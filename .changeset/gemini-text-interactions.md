---
'@tanstack/ai-gemini': minor
---

feat(ai-gemini): add experimental `geminiTextInteractions()` adapter for Gemini's stateful Interactions API (Beta)

Routes through `client.interactions.create` instead of `client.models.generateContent`, so callers can pass `previous_interaction_id` via `modelOptions` and let the server retain conversation history. On each run, the returned interaction id is surfaced via an AG-UI `CUSTOM` event (`name: 'gemini.interactionId'`) emitted just before `RUN_FINISHED` — feed it back on the next turn via `modelOptions.previous_interaction_id`.

Exported from a dedicated `@tanstack/ai-gemini/experimental` subpath so the experimental status is load-bearing in your editor and bundle:

```ts
import { geminiTextInteractions } from '@tanstack/ai-gemini/experimental'
```

Scope: text/chat output with function tools. Built-in Gemini tools (`google_search`, `code_execution`, `url_context`, `file_search`, `computer_use`) and image/audio output via Interactions are not yet supported on this adapter — use `geminiText()` or follow-up adapters for those.

Marked `@experimental` — the underlying Interactions API is Beta and Google explicitly flags possible breaking changes.
