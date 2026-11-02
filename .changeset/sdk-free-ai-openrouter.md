---
'@tanstack/ai-openrouter': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime. Bundles are smaller. The SDK stays a dependency for its TypeScript types. Errors keep the same classes and fields.
