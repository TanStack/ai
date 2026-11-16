---
'@tanstack/ai-isolate-daytona': patch
---

Pin `@daytona/sdk` to `^0.231.1` in the install command. The usage example calls `daytona.create()`, which `@daytona/sdk` 2.0 moves to `daytona.v0`, so an unpinned install breaks the example once 2.0 becomes the default.
