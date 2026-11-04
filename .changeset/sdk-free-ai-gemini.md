---
'@tanstack/ai-gemini': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime, except for the options below. With a bundler that splits chunks, the startup bundle is smaller. The SDK stays a dependency for its TypeScript types and for those options. Errors keep the same `name`, `status`, `message`, and body fields. If your code checks an error with `instanceof` against an error class of `@google/genai`, check `error.name` instead.

These options still load `@google/genai` on first use: `vertexai: true`, `enterprise: true`, no `apiKey`, and a file path string as the upload.
