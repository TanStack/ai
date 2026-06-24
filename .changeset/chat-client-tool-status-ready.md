---
'@tanstack/ai-client': patch
---

Fix `useChat` status getting stuck after a client tool call when the continuation run closes with a bare `RUN_FINISHED { finishReason: 'stop' }` and no assistant message. The client only sets status `ready` via the processor's `onStreamEnd`, and `StreamProcessor.finalizeStream()` emits that callback only when it has a `lastAssistantMessage`; a message-less terminal run never fired it, so status stayed at `submitted`. The client now normalizes status to `ready` on the terminal, non-continuing path. Fixes #421.
