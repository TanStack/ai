# @tanstack/ai-mcp

Host-side Model Context Protocol (MCP) client for TanStack AI.

Discover and run MCP server tools, resources, and prompts inside any TanStack AI `chat()` / agent loop — across any provider adapter — with optional generated end-to-end TypeScript types.

## Features

- `createMCPClient({ transport })` — connect to a single MCP server (Streamable HTTP, SSE, or stdio)
- `createMCPClients({ ... })` — connect to many servers at once with auto-prefix collision avoidance
- Auto-discovery (`client.tools()`) or explicit typed binding (`client.tools([toolDefinition(...)])`)
- `@tanstack/ai-mcp/stdio` subpath — Node-only stdio transport, isolated so edge bundles stay clean
- Bundled `tanstack-ai-mcp generate` CLI — introspects live servers and emits TypeScript types for `createMCPClient<MyServer>()`
- `[Symbol.asyncDispose]` support — use `await using` for automatic cleanup

## Installation

```bash
pnpm add @tanstack/ai-mcp @modelcontextprotocol/sdk
```

## Quick Start

```ts
import { createMCPClient } from '@tanstack/ai-mcp'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://your-mcp-server.com/mcp' },
})

const tools = await mcp.tools()

const result = await chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather in Brooklyn?' }],
  tools,
})

await mcp.close()
```

## License

MIT
