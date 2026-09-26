---
title: Use MCP servers
id: harness-mcp
order: 8
description: "Connect a harness to Notion, Linear, or another MCP server that signs in with OAuth. The user signs in once in the browser, and the tools appear after sign-in."
keywords:
  - tanstack ai
  - harness
  - mcp
  - connectors
  - oauth
  - notion
  - linear
---

Your agent needs to read the user's Linear issues and Notion pages. Both services run MCP servers that sign in with OAuth, so you do not register an app or copy an API key. `mcpConnector` adds `/connect linear`, keeps the token in your credential store, and gives the model the server's tools after sign-in.

## 1. Add the connectors

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/ai-mcp
vue: @tanstack/ai-harness @tanstack/ai-mcp
solid: @tanstack/ai-harness @tanstack/ai-mcp
svelte: @tanstack/ai-harness @tanstack/ai-mcp
preact: @tanstack/ai-harness @tanstack/ai-mcp
angular: @tanstack/ai-harness @tanstack/ai-mcp
octane: @tanstack/ai-harness @tanstack/ai-mcp
vanilla: @tanstack/ai-harness @tanstack/ai-mcp

<!-- ::end:tabs -->

```ts group=harness-mcp
import { defineHarness } from '@tanstack/ai-harness'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { openaiText } from '@tanstack/ai-openai'

const notion = mcpConnector({
  id: 'notion',
  label: 'Notion',
  url: 'https://mcp.notion.com/mcp',
})
const linear = mcpConnector({
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [notion, linear],
})
```

Any MCP server that speaks Streamable HTTP and OAuth works the same way. Give it an `id`, a `label`, and its `url`.

## 2. Sign in

1. Run `/connect linear` in the CLI.
2. The browser opens the Linear consent page. Approve it.
3. The CLI prints `Connected to Linear.`
4. Ask for your issues. The next turn has the Linear tools.

Before sign-in, the model knows that Linear is not connected. If the user asks for Linear, the model tells them to run `/connect linear`.

The sign-in follows the MCP authorization spec:

- The connector reads the server's OAuth metadata and registers a client for this sign-in.
- It signs in with PKCE and a random `state`, and listens on `127.0.0.1` for one callback.
- The token and the registered client go into `stores.credentials`. The next start of the harness uses them, so the user signs in once.
- `/disconnect linear` deletes them.

The model never sees the token. To keep sign-ins after a restart, give the host a credential store. [Auth and connectors](./auth) shows one.

## 3. Choose which tools ask first

The connector names each tool `<id>_<tool>`, for example `linear_list_issues`. A tool that the server does not mark read-only asks for approval before it runs. To change that rule, pass `needsApproval`:

```ts group=harness-mcp
export const linearWithoutWrites = mcpConnector({
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
  // Ask before every tool whose name starts with "save".
  needsApproval: (tool) => tool.name.startsWith('save'),
})
```

Other options:

- `prefix`: the tool name prefix. Default: the `id`.
- `scopes`: the OAuth scopes to ask for. Default: what the server offers.
- `clientName`: the app name on the consent page. Default: `TanStack AI Harness`.

## Tools that appear later

A plugin can give tools that it finds at run time, like the tools of a server that the user signed in to after the session started. Return them from `discoverTools`. The session asks each plugin before every turn:

```ts group=harness-mcp
import { definePlugin } from '@tanstack/ai-harness'
import type { AnyTool } from '@tanstack/ai'

const found: Array<AnyTool> = []

export const lateTools = definePlugin({
  name: 'acme/late-tools',
  setup: () => ({
    discoverTools: () => found,
  }),
})
```

- A tool whose name is already taken is skipped. The first tool keeps the name.
- If `discoverTools` throws, the turn runs without that plugin's tools, and clients get a `harness.plugin.warning` event.

## What you have now

- `/connect` and `/disconnect` for Notion, Linear, and other MCP servers.
- One browser sign-in per service, kept in your credential store.
- Server tools in the model's tool list, with approval for tools that change data.
