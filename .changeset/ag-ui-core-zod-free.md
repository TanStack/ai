---
'@tanstack/ai': minor
---

Remove zod from `@tanstack/ai`'s dependency graph entirely.

`@ag-ui/core` is bumped to `0.1.1-canary.beta.0`, which drops zod from its
runtime dependencies and declares it as an optional peer instead. Previously
every `@tanstack/ai` install pulled zod in transitively through it.

`chatParamsFromRequest` / `chatParamsFromRequestBody` were the only zod
consumers in this package — they validated request bodies with AG-UI's
`RunAgentInputSchema`. They now validate the same `RunAgentInput` contract
structurally, so `@tanstack/ai` ships with no schema-validation runtime at all
and neither requires nor suggests zod.

No API change: both helpers keep their signatures, still reject non-conforming
bodies with a migration-pointing `AGUIError` (`chatParamsFromRequest` still
throws a 400 `Response`), and still carry TanStack's canonical `parts` field
through on messages. Validation errors now name the offending field —
`messages[1].content must be a string` instead of a zod issue dump.

zod remains fully supported for defining tools; it is simply no longer
installed on your behalf. If you relied on getting zod transitively without
declaring it, add it explicitly: `npm install zod`.
