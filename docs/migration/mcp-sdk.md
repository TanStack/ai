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

Your app calls `createMCPClient`, and an import from `@modelcontextprotocol/sdk` does not resolve. `@tanstack/ai-mcp` does not use that package. It uses the v2 packages:

- A client app imports `@modelcontextprotocol/client`.
- A server app imports `@modelcontextprotocol/server`.

## Upgrade

1. If your app imports `@modelcontextprotocol/sdk`, run the MCP codemod from the app root:

   ```bash
   npx @modelcontextprotocol/codemod@latest v1-to-v2 .
   ```

   The codemod rewrites the imports from `@modelcontextprotocol/sdk`. It also rewrites the dependencies in `package.json`.

2. If your app does not import `@modelcontextprotocol/sdk`, remove that dependency.

The codemod comes from the MCP project. TanStack AI does not ship its own codemod for this change.

This is what the codemod does to your imports:

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

## Protocol version

You do not change your `createMCPClient` call. Keep the same transport configuration.

`createMCPClient` tries protocol `2026-07-28` first. If the server does not support that protocol, the client uses the 2025 initialize handshake.

## Done

Your app has no `@modelcontextprotocol/sdk` import, and `createMCPClient` connects to your server with the same transport configuration. For the full MCP setup, see [MCP Server Tools](../tools/mcp).
