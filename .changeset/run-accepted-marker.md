---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
---

A durable run is now joinable from the moment it is accepted, not from its first real chunk — closing the window where refreshing during a sandbox boot permanently orphaned a live run.

- **`@tanstack/ai`**: a fresh durable producer appends (and forwards) a synthetic `CUSTOM` chunk named `RUN_ACCEPTED_EVENT` (`'run.accepted'`, exported) to the delivery log before the producer stream is first pulled. Pulling the stream is what runs the middleware chain, and middleware that boots a sandbox (create a container, install a CLI) can legitimately emit nothing for minutes; during that window the log was empty, so every joiner's empty-log fail-fast (`memoryStream`'s first-chunk deadline, the client's rejoin connect deadline) read the run as gone. Takeover alignment is unaffected: a journal replay cannot reproduce the marker, and alignment already skips stored `CUSTOM` chunks as out-of-band. Consumers that assert exact chunk sequences over a durable wire will see the marker first.
- **`@tanstack/ai-client`**: a rejoin that times out before attaching now KEEPS the persisted resume pointer (the run may simply not have produced yet); only a join the server refuses with a hard error (unknown / evicted run) clears it. Previously one connect-deadline timeout cleared the pointer, so the next reload never retried.
