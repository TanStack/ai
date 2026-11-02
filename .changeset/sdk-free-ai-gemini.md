---
'@tanstack/ai-gemini': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime. Bundles are smaller. The SDK stays a dependency for its TypeScript types. Errors keep the same `name`, `status`, `message`, and body fields. If your code checks an error with `instanceof` against an error class of `@google/genai`, check `error.name` instead.

These options still load `@google/genai` on first use: `vertexai: true`, `enterprise: true`, no `apiKey`, and a file path string as the upload.
