---
'@tanstack/ai-fal': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime, except for the options below. With a bundler that splits chunks, the startup bundle is smaller. The SDK stays a dependency for its TypeScript types and for those options. Errors keep the same `name`, `status`, `message`, and body fields. If your code checks an error with `instanceof` against an error class of `@fal-ai/client`, check `error.name` instead.

- Each fal adapter now keeps its own config. Two fal adapters with different API keys do not overwrite each other.
- Uploads larger than 90 MB still load `@fal-ai/client` on first use.
- `configureFalClient` configures the global `fal` client of `@fal-ai/client` for apps that call `fal` themselves.
