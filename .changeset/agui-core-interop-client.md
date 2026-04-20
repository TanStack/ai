---
'@tanstack/ai-client': patch
---

Thread `@tanstack/ai`'s AG-UI-compliant event shapes through the headless chat client: handle flat `RUN_ERROR` payloads, consume `REASONING_*` events, and warn when receiving the deprecated `[DONE]` sentinel.
