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
- **`@tanstack/ai-mcp`** — tool discovery now captures `serverId` + the UI resource link; `MCPClient` gains a public `callTool`. New `@tanstack/ai-mcp/apps` subpath exports `createMcpAppCallHandler` (a server-side tool-call proxy for interactive widgets — reconnect-per-call by default, same-server allowlist) and an in-memory `McpSessionStore` seam.
- **`@tanstack/ai-client`** — `createMcpAppBridge`, a framework-agnostic bridge routing widget tool-calls to the call handler, follow-up prompts into the chat, and blocking links unless a handler is supplied.
- **`@tanstack/ai-react` / `@tanstack/ai-preact`** — a `MCPAppResource` component (new `./mcp-apps` subpath) that renders a `UIResourcePart` via `@mcp-ui/client`'s `AppRenderer` (optional peer dependency), wired to the bridge.

Persistence is intentionally out of scope (in-memory seams only); Solid/Vue/Svelte/Angular renderers are deferred (the renderer SDK is currently React-only).
