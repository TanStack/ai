---
'@tanstack/ai-secure-mcp': minor
---

Add `@tanstack/ai-secure-mcp`, a security envelope around `createMCPServer` for self-hosting an MCP server on the internet. `createSecureMcpServer` wraps your tools with hashed-token bearer auth, scopes and a per-client target allowlist, a deny-by-default egress helper a tool opts into (it is not an enforced network boundary — a tool that calls global `fetch` still reaches the network), a per-client sliding-window rate limit, a redacted append-only JSONL audit log, a pluggable tripwire notifier (`ntfyNotifier`, `webhookNotifier`, `silentNotifier`), and two-phase propose/confirm approval. A go-live preflight refuses a public Tailscale funnel while a secure default is off (unhashed token, open egress, audit or notifier off).
