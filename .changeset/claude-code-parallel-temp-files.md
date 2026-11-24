---
'@tanstack/ai-claude-code': patch
---

Write the run's temp files (MCP bridge config, output schema, runner, argv, prompt) in parallel before the spawn, and remove them in parallel after the run. On a remote sandbox each `fs` call is a round trip, so a turn used to wait for up to five writes and five removes one after the other. A failed remove is still ignored.
