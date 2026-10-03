---
'@tanstack/ai-harness': patch
---

A background agent run no longer stays `running` after its host stops. The agent run now holds a lease, like a chat turn. When the lease expires, the next host ends the run `failed` and adds a note to the transcript. On a durable host, it also settles the input and, for `start(input, { wake: true })`, starts a new turn. The run does not run again, because it has no checkpoints.

A background agent that fails now also writes a note, and with `wake: true` it starts a new turn, the same as an agent that finishes.
