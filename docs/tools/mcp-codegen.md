---
title: MCP Type Generation
id: mcp-codegen
order: 9
description: "Generate per-server TypeScript interface types from a live MCP server and wire them into createMCPClient for end-to-end type safety."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - codegen
  - type safety
  - mcp.config.ts
  - defineConfig
  - createMCPClient
  - generated types
---

You have a running MCP server and you call its tools through [`createMCPClient`](./mcp), but tool arguments are typed `unknown` at compile time. By the end of this guide you'll have generated per-server `interface` types from the live server and wired them into `createMCPClient` for end-to-end type safety with zero runtime overhead — this is [Mode 3](./mcp#mode-3--generated-types-createmcpclientgeneratedserver) of MCP type safety.

The `generate` CLI introspects a live MCP server and emits TypeScript interface types that you pass as a generic to `createMCPClient` / `createMCPClients`.

## 1. Create `mcp.config.ts`

Declare each server you want to generate types for. The `defineConfig` helper gives the config file full type checking and autocomplete.

```ts
// mcp.config.ts
import { defineConfig } from '@tanstack/ai-mcp'

export default defineConfig({
  servers: {
    github: {
      transport: { type: 'http', url: 'https://github-mcp.example.com/mcp' },
    },
    linear: {
      transport: { type: 'http', url: 'https://linear-mcp.example.com/mcp' },
      prefix: 'linear', // must match runtime createMCPClient({ prefix })
    },
  },
  outFile: './mcp-types.generated.ts',
})
```

## 2. Run the generator

```bash
npx @tanstack/ai-mcp generate
```

The CLI connects to each declared server, introspects its tools, resources, and prompts, and writes the result to `outFile`.

## 3. Inspect the output

The generator emits one interface per server plus a combined pool map:

```ts
// mcp-types.generated.ts — AUTO-GENERATED, do not edit

import type { ServerDescriptor } from '@tanstack/ai-mcp'

export interface GithubServer extends ServerDescriptor {
  tools: {
    'search_repositories': { input: { query: string; limit?: number }; output: unknown }
    'create_issue': { input: { repo: string; title: string; body?: string }; output: unknown }
  }
  resources: {}
  prompts: {}
  capabilities: { tools: {} } & Record<string, unknown>
}

export interface LinearServer extends ServerDescriptor {
  tools: {
    'linear_create_issue': { input: { title: string; teamId: string }; output: unknown }
  }
  resources: {}
  prompts: {}
  capabilities: { tools: {} } & Record<string, unknown>
}

export interface MCPServers extends Record<string, ServerDescriptor> {
  'github': GithubServer
  'linear': LinearServer
}
```

## 4. Use generated types at runtime

Pass the generated type as a generic to [`createMCPClient`](./mcp) (single server) or `createMCPClients` (pool). Tool names are narrowed to the literal types declared by the server, so a typo is a compile error.

**Single server:**

```ts
import type { GithubServer } from './mcp-types.generated'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient<GithubServer>({
  transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
})

const tools = await mcp.tools()
// Each tool name is narrowed from GithubServer['tools']
```

**Multi-server pool:**

```ts
import type { MCPServers } from './mcp-types.generated'
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients<MCPServers>({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: {
    transport: { type: 'http', url: process.env.LINEAR_MCP_URL! },
    prefix: 'linear',
  },
})

// Config keys are constrained to the declared servers — a typo is a compile error
const tools = await pool.tools()
```

Now that your tools are typed, hand the generated client to `chat()`. See [Managing MCP clients with `chat()`](./mcp-chat) to let `chat()` own discovery and lifecycle.
