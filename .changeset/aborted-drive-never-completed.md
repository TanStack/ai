---
'@tanstack/ai-sandbox': patch
---

Fix `pipeToRunLog` recording an aborted drive as `'completed'`.

`pipeToRunLog` checked its `signal` only inside the per-chunk loop, so an abort that arrived _between_ chunks — or a producer that reacted to the signal by simply ending its stream, which is what `chat()` does — let the loop exit normally and fall through to the success path. The run was then recorded `status: 'completed'` with a `finishedAt` it never earned. The signal is now re-checked after the loop: an aborted drive finishes as `'aborted'` whatever the producer did on its way out. A producer that _throws_ on abort still records `'failed'` (the thrown value is what a tailing client must be shown), a genuine completion still records `'completed'`, and `durability.close()` still runs on every exit path.

The visible symptom was a false transcript on the worst possible run: `reapDetachedRuns` force-expiring a detached run past its TTL, destroying its sandbox, and reporting the run as having completed successfully. Any caller whose producer ends its stream on abort hit the same gap, including a takeover whose claim is lost mid-drive.

With the status honest, `reapDetachedRuns` no longer reports the TTL-expiry path as the `'budget-exceeded'` anomaly. That outcome is documented as meaning the journal read, translation, or log is misbehaving, and it is now reserved for the finalization path where the probe already said the agent was finished. On the expiry path there is no probe and `runBudgetMs` is the only thing that stops a still-producing agent, so the designed stop reports `'expired'` — with `status: 'aborted'` distinguishing an agent cut off mid-sentence from one that had already finished.
