---
'@tanstack/ai-harness': minor
---

`createHarnessHost({ logger })` takes a `Logger` from `@tanstack/ai` for the warnings and errors of the harness and its `chat()` calls (default: `ConsoleLogger`). Plugins get it as `ctx.logger`, and a logger that throws does not stop the harness.
