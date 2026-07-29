---
'@tanstack/ai': patch
---

Durable streaming runs now survive a client disconnect (page reload) and can be
tailed to completion by a rejoining client — no route-side detachment code
required. Two internal fixes to `toServerSentEventsResponse` /
`toHttpResponse`, both additive with no public API change:

- **`RUN_STARTED` is a durability flush boundary.** One-shot generation
  activities (image, speech, transcription, summarize) emit `RUN_STARTED`, then
  await the provider for seconds, then a terminal. Previously `RUN_STARTED` sat
  in the batch buffer, so the durable log was empty for the whole run and a
  mount-time `joinRun` fast-failed as "run gone". It now flushes immediately, so
  the run is resumable from the instant it starts.
- **The producer is decoupled from the HTTP response when durability is on.**
  A client disconnect used to abort the producer and seal the log with
  `RUN_ERROR`, even though the run kept running and recorded success. Now, on a
  durable (persistence-on) run, a response cancel detaches and the producer
  keeps draining into the log to its real terminal, so a rejoining client tails
  it to completion. This supersedes the earlier "producers terminalize the log
  on cancellation" behavior **for durable runs only**:
  - **No durability (persistence off)** → unchanged: a disconnect aborts and
    stops the run.
  - **Durability present (persistence on)** → the run survives a disconnect.
  - A genuine caller stop — aborting an `abortController` you pass (e.g. wired to
    `request.signal`, as the resumable-streams demo does) — still terminalizes
    the run, so opt-in die-on-disconnect keeps working.
