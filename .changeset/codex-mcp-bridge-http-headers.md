---
'@tanstack/ai-codex': patch
---

Fix codex failing to start whenever `chat()`-provided tools are bridged to it. The adapter configured the MCP tool-bridge with an inline `mcp_servers.<name>.bearer_token`, but current codex rejects that for the streamable-HTTP transport — the run died immediately with `Error loading config.toml: bearer_token is not supported for streamable_http`. The per-run bearer is now passed as an `Authorization` header (`http_headers = { "Authorization" = "Bearer <token>" }`), matching what the workspace-MCP projection already emits and what the host tool-bridge authenticates against. Codex with bridged tools (e.g. the Cloudflare sandbox example) now runs end to end.
