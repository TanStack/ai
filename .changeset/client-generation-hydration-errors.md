---
'@tanstack/ai-client': minor
---

Server-driven generation hydration no longer swallows every failure.

`GenerationClient` / `VideoGenerationClient` mount hydration
(`persistence: true`) wrapped the whole `hydrateGeneration` call in a bare
`try { … } catch { return }`, collapsing a transport error, a `403` from the
`reconstructGeneration` authorize gate, an unparseable body, and "no record for
this thread" into one indistinguishable silent no-op — so an app could not tell a
broken server from a fresh thread, and had no signal to retry.

- A genuine **miss** (the server reports no record) stays silent, as before.
- A genuine **failure** now surfaces on `status` / `error` and fires `onError`,
  with a message naming the cause. A record the client's own validator rejects
  (unknown schema version, missing/invalid `status` or `resumeState`) counts as a
  failure, not a miss.
- The failure is skipped when a `generate()` took ownership of the client while
  the hydrate request was in flight — the live run still wins.

Relatedly, `fetchServerSentEvents` / `fetchHttpStream` `hydrateGeneration` now
only treats a `200` carrying `null` as a miss. Any other non-object body (a
string, an array) rejects instead of being reported as an empty thread, so a
misconfigured route no longer masquerades as a fresh one.
