---
'@tanstack/ai': minor
---

New optional cancel hooks. Old code works the same.

- `MCPToolSource.tools()` takes an optional `signal`. `chat()` passes the signal of its `abortController` to each MCP source during tool discovery.
- `VideoAdapter` has an optional `cancelVideoJob(jobId, options?)` method. A streaming `generateVideo()` calls it (best effort) when its `abortSignal` or `timeout` aborts after the provider accepted the job. A failed cancel is logged and does not change the abort result.
