---
title: Use MCP servers
id: harness-mcp
order: 8
description: "Connect a harness to MCP servers: a local server that runs as a process, a remote server, or Notion and Linear with an OAuth sign-in. The model gets the tools of each server, with its name as a prefix."
keywords:
  - tanstack ai
  - harness
  - mcp
  - connectors
  - oauth
  - stdio
  - code mode
  - notion
  - linear
---

Your agent needs tools from MCP servers. Some servers run on your machine. Some are remote and take an API key. Notion and Linear sign in with OAuth. `mcp()` connects each server by name, and gives the model the tools of each server.

This page connects your harness to MCP servers. To use your harness from an MCP client such as Claude Code, read [Use a harness from any MCP client](./mcp-server).

## 1. Add the servers

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
import { mcp } from '@tanstack/ai-mcp/harness'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    mcp({
      servers: {
        files: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        },
        docs: {
          type: 'http',
          url: 'https://mcp.example.com/mcp',
          headers: { authorization: `Bearer ${process.env.DOCS_TOKEN}` },
        },
        linear: { type: 'http', url: 'https://mcp.linear.app/mcp', oauth: true },
      },
    }),
  ],
})
```

The name of a server is the prefix of its tools. A `search` tool of the `docs` server is `docs_search` for the model.

- `stdio`: the server runs as a child process on this machine (Node only). It stops when the session closes.
- `http`: a server that speaks Streamable HTTP. Send an API key in `headers`.
- `oauth: true`: the user signs in with `/connect linear`. See [Sign in to an OAuth server](#3-sign-in-to-an-oauth-server).

## 2. Check the servers

The servers connect in the background when the session opens. The first turn waits for them. Each server connects on its own, so a server that fails does not stop the tools of the others.

`/mcp` shows each server and its status:

```text
files: connected (14 tools)
docs: failed: Failed to connect to MCP server: Version negotiation probe failed: connection refused
linear: failed: Not signed in. Run /connect linear.
```

In [your own UI](./custom-ui), read the same list from `state.plugins['tanstack/mcp'].servers`. Each entry is an `McpServerStatus`:

- `name`: the name of the server.
- `status`: `connecting`, `connected`, or `failed`. A `failed` entry has an `error`.
- `toolCount`: how many tools the server gives the model.

## 3. Sign in to an OAuth server

1. Run `/connect linear` in the CLI.
2. The browser opens the Linear consent page. Approve it.
3. The CLI prints `Connected to linear.`
4. Ask for your issues. The next turn has the Linear tools.

Before sign-in, the model knows that Linear is not connected. If the user asks for Linear, the model tells them to run `/connect linear`.

The sign-in follows the MCP authorization spec:

- The connector reads the server's OAuth metadata and registers a client for this sign-in.
- It signs in with PKCE and a random `state`, and listens on `127.0.0.1` for one callback.
- The token and the registered client go into `stores.credentials`. The next start of the harness uses them, so the user signs in once.
- A new `/connect linear` replaces them. Nothing from the old sign-in stays.
- `/disconnect linear` deletes them.

Sometimes the server no longer accepts the sign-in, for example after the user removes the app in Linear. Then the turn runs without the Linear tools, and clients get a `harness.auth_required` event. The CLI prints `Sign in to linear. Run /connect linear.`, and the model tells the user to run `/connect linear`. If the server refuses the saved refresh token, the connector deletes the saved sign-in.

The model never sees the token. To keep sign-ins after a restart, give the host a credential store. [Auth and connectors](./auth) shows one. With `oauth: true`, `headers` and `authProvider` do not apply.

## Choose which tools ask first

- A tool of an `oauth: true` server asks for approval before it runs, unless the server marks it read-only.
- The tools of the other servers run without a question.

To make the `docs` tools ask first, add a permission rule for them, next to `permissions()`:

```ts group=harness-mcp
import { definePlugin } from '@tanstack/ai-harness'
import { PermissionRules, permissions } from '@tanstack/ai-harness/plugins'

const askForDocs = definePlugin({
  name: 'acme/ask-for-docs',
  setup: () => ({
    contribute: [PermissionRules.item({ tool: 'docs_*', decision: 'ask' })],
  }),
})

export const careful = defineHarness({
  name: 'acme/careful',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions(),
    mcp({ servers: { docs: { type: 'http', url: 'https://mcp.example.com/mcp' } } }),
    askForDocs,
  ],
})
```

[Ask before risky tool calls](./permissions) explains the rules and the modes.

## Move the tools into code mode

A server with many tools fills each request with their schemas. Set `codeMode: true` on the server, and add the [`codeMode()` plugin](./code-mode). The model then calls the tools from one TypeScript program:

```ts group=harness-mcp
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

export const coded = defineHarness({
  name: 'acme/coded',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    mcp({
      servers: {
        docs: { type: 'http', url: 'https://mcp.example.com/mcp', codeMode: true },
      },
    }),
    codeMode({ driver: createQuickJSIsolateDriver() }),
  ],
})
```

- Without the `codeMode()` plugin, `codeMode: true` changes nothing.
- A call inside the program does not stop for a question. So a marked tool moves only when it is safe to run without one.
- Safe means: the tool does not need approval, the `PermissionRules` of your plugins allow it in plan mode, and it declares no permission resources.
- A tool that is not safe stays a normal tool call, with its question. For example, a rule that asks for `docs_*` keeps the `docs` tools out of code mode.

## Set a time limit

`timeoutMs` limits how long one server can take to connect, to send its tool list, and to answer each tool call:

```ts group=harness-mcp
export const quick = mcp({
  servers: {
    docs: { type: 'http', url: 'https://mcp.example.com/mcp', timeoutMs: 10_000 },
  },
})
```

- The default is the MCP SDK default, 60 seconds.
- A server that is too slow gets the status `failed`. The tools of the other servers still work.
- If a server does not connect in time, the plugin closes its open request or stops its child process.
- With `oauth: true`, `timeoutMs` does not limit the time to connect.

A server that does not connect in time shows this in `/mcp`:

```text
docs: failed: MCP server "docs" did not connect within 10000 ms.
```

## One OAuth server with more options

`mcpConnector` adds one OAuth server, with options that `mcp()` does not have. The sign-in works as in [step 3](#3-sign-in-to-an-oauth-server):

```ts group=harness-mcp
import { mcpConnector } from '@tanstack/ai-mcp/connector'

export const linearWithoutWrites = mcpConnector({
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
  // Ask before every tool whose name starts with "save".
  needsApproval: (tool) => tool.name.startsWith('save'),
})
```

Add it to the plugins like any plugin: `plugins: () => [linearWithoutWrites]`. The CLI then prints `Connected to Linear.`, with the `label`.

- `needsApproval`: which tools ask first. Default: every tool that the server does not mark read-only.
- `prefix`: the tool name prefix. Default: the `id`.
- `scopes`: the OAuth scopes to ask for. Default: what the server offers.
- `clientName`: the app name on the consent page. Default: `TanStack AI Harness`.

## Tools that appear later

A plugin can give tools that it finds at run time, like the tools of a server that the user signed in to after the session started. Return them from `discoverTools`. The session asks each plugin before every turn:

```ts group=harness-mcp
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

- Tools from local, remote, and OAuth MCP servers, with the server name as a prefix.
- A status for each server, in `/mcp` and in your UI.
- One browser sign-in per service, kept in your credential store.
- A question before the tools that change data, and code mode for the tools that are safe.
