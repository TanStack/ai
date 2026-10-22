---
'@tanstack/ai-harness': patch
---

Any server instance that reads the same log store can serve a run.

- `POST run` sends the log cursor of each event as its SSE `id`. A client that is cut off sends the same request with `Last-Event-ID`, and any instance continues the stream from there. The turn does not run again.
- `GET run?runId=&threadId=` finds a turn that another instance runs. It streams the turn from the log of `threadId`, from its start or from `Last-Event-ID`, until the turn ends. It reads the log from the start of the turn, not from the start of the log. A turn rebuilt after a restart (a retried `POST run`) also streams from its start. Without `threadId`, only the instance that runs the turn finds it, and another instance answers `400`. The join request of a `ChatClient` sends only the run id, so put `threadId` in the URL of the connection.
- `GET run?threadId=` shows a turn that another instance runs as `activeRun`, so a reloaded `useChat` joins it.
