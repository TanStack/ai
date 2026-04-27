---
'@tanstack/ai-gemini': minor
---

feat(ai-gemini): add experimental `geminiTextInteractions()` adapter for Gemini's stateful Interactions API (Beta)

Routes through `client.interactions.create` instead of `client.models.generateContent`, so callers can pass `previous_interaction_id` via `modelOptions` and let the server retain conversation history. On each run, the returned interaction id is surfaced via an AG-UI `CUSTOM` event (`name: 'gemini.interactionId'`) emitted just before `RUN_FINISHED` — feed it back on the next turn via `modelOptions.previous_interaction_id`.

Exported from a dedicated `@tanstack/ai-gemini/experimental` subpath so the experimental status is load-bearing in your editor and bundle:

```ts
import { geminiTextInteractions } from '@tanstack/ai-gemini/experimental'
```

Scope: text/chat output with function tools, plus the built-in tools `google_search`, `code_execution`, `url_context`, `file_search`, and `computer_use`. Built-in tool activity is surfaced as AG-UI `CUSTOM` events named `gemini.googleSearchCall` / `gemini.googleSearchResult` (and the matching `codeExecutionCall`/`Result`, `urlContextCall`/`Result`, `fileSearchCall`/`Result` variants), carrying the raw Interactions delta payload. Function-tool `TOOL_CALL_*` events are unchanged, and `finishReason` stays `stop` when only built-in tools ran — the core chat loop has nothing to execute.

`google_search_retrieval`, `google_maps`, and `mcp_server` are not supported on this adapter and throw a targeted error explaining the alternative. Image/audio output via Interactions is also not routed through this adapter — use `geminiText()`, `geminiImage`, or `geminiSpeech` for those.

Marked `@experimental` — the underlying Interactions API is Beta and Google explicitly flags possible breaking changes.
