---
'@tanstack/ai-anthropic': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime. Bundles are smaller. The SDK stays a dependency for its TypeScript types. Errors keep the same classes and fields.

These options still load `@anthropic-ai/sdk` on first use: `middleware`, OpenTelemetry tracing, `logLevel: 'info'` or `'debug'` (or `ANTHROPIC_LOG`), and no `apiKey` and no `authToken`.
