---
'@tanstack/ai': minor
'@tanstack/ai-mcp': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
---

feat: MCP Apps support — render interactive `ui://` widgets served by MCP servers

Adds support for the ratified [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) standard, letting MCP server tools return interactive UI widgets that render in the chat.

- **`@tanstack/ai`** — MCP tool results that link a `ui://` resource (via `_meta.ui.resourceUri`) now surface as a new `UIResourcePart` on the assistant `UIMessage` (carried as an AG-UI `CUSTOM` event). The widget never enters model input. The `ui://` resource is read eagerly during the run, fail-soft.
- **`@tanstack/ai-mcp`** — tool discovery now captures `serverId` + the UI resource link; `MCPClient` gains a public `callTool` and `getInfo()` (returns the client's transport descriptor); `MCPClients` gains `getServers()` (returns all pool entries' descriptors). New `@tanstack/ai-mcp/apps` subpath exports `createMcpAppCallHandler` — a server-side tool-call proxy for interactive widgets that takes the MCP client(s)/pool you already created (`clients: MCPClient | MCPClients | Array<MCPClient | MCPClients>`), reads each client's transport descriptor via `MCPClient.getInfo()` / `MCPClients.getServers()` (pure config, no live socket required), and **reconnects per call** (stateless, serverless-safe by default, same-server allowlist). Also exports an in-memory `McpSessionStore` seam for stateful transports.
- **`@tanstack/ai-client`** — `createMcpAppBridge`, a framework-agnostic bridge routing widget tool-calls to the call handler, follow-up prompts into the chat, and blocking links unless a handler is supplied.
- **`@tanstack/ai-react` / `@tanstack/ai-preact`** — a `MCPAppResource` component (new `./mcp-apps` subpath) that renders a `UIResourcePart` via `@mcp-ui/client`'s `AppRenderer` (optional peer dependency), wired to the bridge. Plus a `useMcpAppBridge` hook (main entry) that returns a stable `createMcpAppBridge` for a given `threadId`/`callEndpoint` while always calling the latest `sendMessage`/`onLink`.

Persistence is intentionally out of scope (in-memory seams only); Solid/Vue/Svelte/Angular renderers are deferred (the renderer SDK is currently React-only).
