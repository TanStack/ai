---
'@tanstack/ai-durable-stream': patch
---

`durableStream` now resolves the run id exactly the way core does, through
`resolveResumeRunId` from `@tanstack/ai`: the `X-Run-Id` header first, then the
`?runId` query param. It previously read `?runId` only.

Two consequences of the old query-only resolution are fixed:

- A `@tanstack/ai-client` POST keeps its URL byte-identical to a plain chat
  request and carries the run id in `X-Run-Id`, so a POST producer route wired
  to `durableStream` wrote to a random-UUID stream while the GET attach route
  addressed the real one — the producing and attaching routes never met.
- A mid-stream reconnect re-POSTs with `Last-Event-ID` and no `?runId`, which
  tripped the resume guard and threw `resume offset requires a runId`.

**Behavior change:** a request that names no run at all — neither header nor
query — now throws instead of generating a run id. A generated id names a stream
no attach request could ever address, so the producer appeared healthy while
writing where nobody could read. This matches `DurableRunIdRequiredError` in
`@tanstack/ai-sandbox`. Pass the run id in `X-Run-Id` (what the client adapters
send) or `?runId`.
