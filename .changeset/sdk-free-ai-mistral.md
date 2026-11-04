---
'@tanstack/ai-mistral': patch
---

The adapters now call the provider HTTP API with `fetch` and do not create the `@mistralai/mistralai` client. At runtime they load only the SDK error classes. Bundles are smaller. A 422 response now throws the adapter's own `HTTPValidationError`, not the SDK class. It has the same `name`, `message`, and `detail` fields, and it is still an `instanceof MistralError`. If your code checks a 422 error with `instanceof` against the SDK `HTTPValidationError`, check `error.name` instead.
