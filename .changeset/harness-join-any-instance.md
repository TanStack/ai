---
'@tanstack/ai-harness': patch
---

On a durable host (`stores.log` and `stores.runs`), any server instance can serve a run.

- `POST run` sends the log cursor of each event as its SSE `id`. A client that is cut off sends the same request with `Last-Event-ID`, and any instance continues the stream from there. The turn does not run again.
- `GET run?runId=` finds a turn that another instance runs. It streams the turn from the shared log, from its start or from `Last-Event-ID`, until the turn ends.
- `GET run?threadId=` shows a turn that another instance runs as `activeRun`, so a reloaded `useChat` joins it.
