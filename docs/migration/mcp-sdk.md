---
title: MCP SDK packages
id: mcp-sdk
order: 7
description: "Move a createMCPClient app from @modelcontextprotocol/sdk to @modelcontextprotocol/client or @modelcontextprotocol/server."
keywords:
  - tanstack ai
  - mcp
  - migration
  - createMCPClient
  - model context protocol
---

Your app calls `createMCPClient`. The app still imports `@modelcontextprotocol/sdk`. That import does not resolve. `@tanstack/ai-mcp` does not use that package.

- A client app imports `@modelcontextprotocol/client`.
- A server app imports `@modelcontextprotocol/server`.

```diff
- import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
- import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
+ import {
+   StreamableHTTPClientTransport,
+   type OAuthClientProvider,
+ } from '@modelcontextprotocol/client'

- import { Server } from '@modelcontextprotocol/sdk/server/index.js'
+ import { Server } from '@modelcontextprotocol/server'
```

## Codemod

1. If the app imports `@modelcontextprotocol/sdk`, run `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` from the app root.
2. If the app does not import `@modelcontextprotocol/sdk`, remove that dependency.

```bash
npx @modelcontextprotocol/codemod@latest v1-to-v2 .
```

The codemod rewrites imports from `@modelcontextprotocol/sdk`. The codemod rewrites the `package.json` dependencies.

This repo does not ship its own codemod.

## Protocol

`createMCPClient` tries protocol `2026-07-28` first. If the server does not support that protocol, the client uses the 2025 initialize handshake.

Call `createMCPClient` with the same transport config. The client connects.
