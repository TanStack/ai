---
'@tanstack/ai-client': minor
---

A restored generation whose result can't be rebuilt now reports an error instead
of repainting as a blank success.

Every `reconstructResult` mapper in `generation-reconstruct.ts` (and the video
client's built-in `reconstructVideoResult`) returns `null` when the persisted
record lacks what it needs — most commonly an output artifact stored without a
serve `url`, which is possible because `artifactUrl` is optional server-side.
`repaintFromSnapshot` silently skipped `setResult` in that case, leaving
`status: 'success'` with `result: null`: a state no consumer can render, and one
that hides the real cause.

When a mapper declines a snapshot whose status is `complete`, the restore now
settles on `status: 'error'` with an explanatory message and fires `onError`. A
decline on any other status is still silent — a `running` snapshot has no result
yet by definition, and the rejoin delivers it. A client with no
`reconstructResult` mapper at all is unaffected.
