---
'@tanstack/ai-client': patch
---

Rejoining a run no longer loses the answer when the replay starts with encrypted-only reasoning, for example from Azure OpenAI Responses. The client now drops only the assistant message it hydrated before the replay, not the message the replay has already started.
