---
'@tanstack/ai': patch
---

`fakeText` from `@tanstack/ai/testing` now stops on `request.signal`, the abort signal `chat()` passes to adapters. Before, it read only `abortController`, so code that reads the adapter stream directly (a harness, for example) saw a paced fake keep streaming after a cancel.
