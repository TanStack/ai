---
'@tanstack/ai-harness': minor
---

Add `createSessionView()` in `@tanstack/ai-harness/view`. It turns a session (local, or remote through `createHarnessClient()`) into one live TanStack Store state: messages with their parts, tool calls, approvals, client tools, questions, sign-ins, child agents, media with signed URLs, settings, commands, and plugin state. It also gives actions (`send`, `command`, `approve`, `reject`, `cancel`, ...) and typed events (`view.on('turnEnd', ...)`, plugin events). The state works with any UI library.
