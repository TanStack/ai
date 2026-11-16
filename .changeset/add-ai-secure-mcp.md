---
'@tanstack/ai-secure-mcp': minor
---

Add `@tanstack/ai-secure-mcp`, a security envelope around `createMCPServer` for self-hosting an MCP server on the internet. `createSecureMcpServer` wraps your tools with hashed-token bearer auth, scopes and a per-client target allowlist, deny-by-default egress (no generic `fetch`), a per-client sliding-window rate limit, a redacted append-only JSONL audit log, a pluggable tripwire notifier (`ntfyNotifier`, `webhookNotifier`, `silentNotifier`), and two-phase propose/confirm approval. A go-live preflight refuses a public Tailscale funnel while a secure default is off (unhashed token, open egress, audit or notifier off).
