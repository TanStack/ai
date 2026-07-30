---
'@tanstack/ai-sandbox': minor
---

Add `reapDetachedRuns`, `pruneJournals`, and `reclaimSandbox`: the sweep that closes out a detached durable run.

Detaching a run on disconnect (see the durable-agent-runs changeset) leaves `detachedSince` on the record and a journal on disk, but nothing acted on either — recovery was manual. This ships the sweep, built on `RunStore.listReclaimable`:

- **`reapDetachedRuns(deps, opts)`** makes two passes over the reclaim candidates. A run whose journal already reached its `{"__exit":N}` sentinel is driven to terminal so its transcript lands (outcome `'finalized'`); a run past `opts.detachedRunTtlMs` is `requestRunCancel`'d and then driven (outcome `'expired'`). Every other outcome (`'producing'`, `'unknown'`, `'budget-exceeded'`, `'not-claimed'`, `'failed'`) means the run was left alone. It never drives a run purely to find out whether it finished — an injected `hasFinished` probe reads the journal out of band first.
- **`pruneJournals(deps, opts)`** deletes a journal only once its run is provably terminal; anything it cannot prove dead is left in place.
- **`reclaimSandbox`** / **`sandboxReclaimer`** reclaim the sandbox recorded against a run once it's terminal, from `RunRecord.sandboxKey`.
- All of the above, plus the journal listing and exit-probe helpers behind them, are exported from `@tanstack/ai-sandbox`'s root.

**This ships a function, not a scheduler.** `reapDetachedRuns` does not run itself — the application must call it on its own cadence (a cron job, a Vercel Cron route, a Cloudflare Workers `alarm()`, a queue consumer). An app that wires `durability` and `runs` but never schedules the reaper has nothing closing out detached runs: tailers on a detached run park forever, `detachedRunTtlMs` is enforced by nothing, and a sandbox that should have been reclaimed keeps billing. Wiring durability and scheduling the reaper are two separate integration steps; only the second one closes the loop.

This corrects `durable-agent-runs-takeover.md`'s claim that "the TTL reaper still reclaims a stuck detach" — that is only true once the application schedules `reapDetachedRuns`. Nothing reclaimed anything automatically before this changeset, and nothing does after it either, absent that wiring.
