---
'@tanstack/ai': minor
---

Stop pulling Zod 3 into consumer dependency trees and type graphs (#520).

`@tanstack/ai` now depends on `@ag-ui/core@^0.1.0`, whose main entry is
type-only with zero runtime dependencies. Apps on Zod 4 (e.g. using
`@hookform/resolvers@5`) no longer hit `zod/v4/core` version-mismatch type
errors caused by the transitive Zod 3 that earlier `@ag-ui/core` versions
carried.

`chatParamsFromRequest` / `chatParamsFromRequestBody` now load
`RunAgentInputSchema` lazily from the `@ag-ui/core/schemas` subpath. That
subpath requires zod (`^3.24.0 || ^4.0.0` — whichever major your app already
has), so zod is now an optional peer dependency of `@tanstack/ai`: only
server code calling `chatParamsFromRequest*` needs it installed. Calling it
without zod rejects with an `AGUIError` explaining what to install. Wire
behavior is unchanged.
