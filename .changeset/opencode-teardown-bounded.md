---
'@tanstack/ai-opencode': patch
'@tanstack/ai-sandbox': patch
---

`RUN_FINISHED` now arrives when a teardown step does not settle. The OpenCode adapter gives each teardown step (session dispose, server dispose, tool bridge close) one second and logs a step that fails. The host tool bridge's `close()` now closes open connections, so an agent that holds a request open on the bridge no longer blocks the end of a Claude Code, Codex, or OpenCode run.
