---
'@tanstack/ai-elevenlabs': patch
---

The adapters now call the provider HTTP API with `fetch` and do not create the `@elevenlabs/elevenlabs-js` client. At runtime they load only the SDK error classes. Bundles are smaller. Errors keep the same classes and fields.
