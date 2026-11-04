---
'@tanstack/ai-anthropic': patch
---

The adapters now call the provider HTTP API with `fetch` and do not create the `@anthropic-ai/sdk` client. At runtime they load only small SDK modules, for example the error classes from `@anthropic-ai/sdk/core/error`. With a bundler that splits chunks, the startup bundle is smaller. Errors keep the same classes and fields.

These options still load `@anthropic-ai/sdk` on first use: `middleware`, OpenTelemetry tracing, `logLevel: 'info'` or `'debug'` (or `ANTHROPIC_LOG`), and no `apiKey` and no `authToken`.
