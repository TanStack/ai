---
'@tanstack/ai-persistence': patch
---

`withPersistence` now maps cancelled client-tool and approval resume entries
into `cancelledToolCallIds`. A resume batch that is only cancellations still
produces a `resumeToolState`, so the engine can complete the turn instead of
emitting another `client_tool_*` interrupt.
