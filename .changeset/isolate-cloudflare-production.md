---
'@tanstack/ai-isolate-cloudflare': patch
---

feat(ai-isolate-cloudflare): support production deployments and close tool-name injection vector

The Worker now documents production-capable `unsafe_eval` usage (previously the code, wrangler.toml, and README all described it as dev-only). Tool names are validated against a strict identifier regex before being interpolated into the generated wrapper code, so a malicious tool name like `foo'); process.exit(1); (function bar() {` is rejected at generation time rather than breaking out of the wrapping function.
