---
'@tanstack/ai-harness': minor
---

`ChatClient` and `useChat` work with the harness handler's `POST run` route.

- A turn started by `POST run` runs as the request's `runId`, so a `ChatClient` can answer its approvals and client tools. A retry with the same `runId` runs once. The same `runId` with another message gets 409.
- `GET run?threadId=` answers with the transcript, the running turn, and the waiting interrupts, as the hydrate data that a `ChatClient` with `persistence: true` reads.
- `GET run?runId=` streams the turn with that run id from its first event, with each event's cursor as its SSE id. A reloaded `useChat` with `persistence: true` joins a running turn this way, and `Last-Event-ID` resumes the stream. `canAccess` decides who can join.
- A question from `ctx.session.ask` during a turn arrives on that turn's stream.
- Each `snapshot().activeOperations` entry has `startedCursor`, so `events({ from: startedCursor })` reads a running operation from its first event.
