---
'@tanstack/ai-openrouter': patch
---

The adapters now call the provider HTTP API with `fetch` and do not create the `@openrouter/sdk` client. At runtime they load only the SDK error classes. Bundles are smaller. Errors keep the same `name` and fields, and they are still an `instanceof OpenRouterError`. An `instanceof` check against a typed SDK error class (for example `BadRequestResponseError` or `TooManyRequestsResponseError`) no longer matches. Check `error.name` instead.
