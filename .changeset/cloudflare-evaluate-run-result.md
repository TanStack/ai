---
'@tanstack/ai-cloudflare': patch
---

Fix `decide()` with the Cloudflare decider (`typesafe/jev`). Workers AI returns Jev output wrapped in `{ state, result }`, so every call threw `Cannot read properties of undefined (reading 'input_tokens')`. The adapter now reads `result`. Over REST, third-party models such as `typesafe/jev` now run on `/ai/run` with a `{ model, input }` body. The old `/ai/run/typesafe/jev` path returned `400 No route for that URI`.
