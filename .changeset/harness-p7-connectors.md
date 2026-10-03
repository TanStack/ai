---
'@tanstack/ai-mcp': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-persistence': minor
---

`@tanstack/ai-mcp/connector` adds `mcpConnector`: a harness plugin that signs the user in to a remote MCP server (Notion, Linear, and others) with OAuth, then gives the model the server's tools. `/connect <id>` registers a client, signs in with PKCE on a `127.0.0.1` loopback, and keeps the token in the credential store. Tools the server does not mark read-only ask for approval.

`@tanstack/ai-harness` adds `discoverTools` to plugins, for tools found at run time, and `startLoopbackReceiver` for OAuth redirects. A harness turn now runs up to 50 model calls by default (`agentLoopStrategy` still overrides it).

`@tanstack/ai-persistence`: an `oauth` credential can keep the OAuth `client` it was issued to.
