---
'@tanstack/ai-byteplus': patch
---

The adapters now call the provider HTTP API with `fetch` and do not create the `openai` SDK client. At runtime they load only small SDK modules, for example the error classes from `openai/core/error`. With a bundler that splits chunks, the startup bundle is smaller. A single-file bundle can be a little larger, because a few rare options still load the full SDK on first use. Errors keep the same classes and fields.
