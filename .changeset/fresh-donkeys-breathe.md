---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-vue': patch
---

Add an explicit subscription lifecycle to `ChatClient` with `subscribe()`/`unsubscribe()`, `isSubscribed`, `connectionStatus`, and `sessionGenerating`, while keeping request lifecycle state separate from long-lived connection state for durable chat sessions.

Update the React, Preact, Solid, Svelte, and Vue chat bindings with `live` mode plus reactive subscription/session state, and improve `StreamProcessor` handling for concurrent runs and reconnects so active sessions do not finalize early or duplicate resumed assistant messages.
