---
'@tanstack/ai-isolate-quickjs-bun': patch
---

Update `quickjs-bun` to 0.2.0. Version 0.1.2 cannot compile its native code on Ubuntu 26.04, so the driver failed to create a context there. The driver now needs Bun 1.4.0 or later.
