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

// One time, outside `plugins`, so the sessions share the stdio server.
const tools = mcp({
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
})

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [tools],
})
```

The name of a server is the prefix of its tools. A `search` tool of the `docs` server is `docs_search` for the model. To choose other names, see [Rename the tools of a server](#rename-the-tools-of-a-server).

- `stdio`: the server runs as a child process on this machine (Node only). The host starts it one time for each harness, and every session that uses the same `mcp()` object shares it. It stops when the last session that uses it closes, or at `host.close()`. A `plugins` function that calls `mcp()` for each session starts a process for each session.
- `http`: a server that speaks Streamable HTTP. Send an API key in `headers`. Each session connects on its own.
- `oauth: true`: the user signs in with `/connect linear`. Each user connects with their own sign-in. See [Sign in to an OAuth server](#3-sign-in-to-an-oauth-server).

## 2. Check the servers

The servers connect in the background when the session opens. The first turn waits for them. Each server connects on its own, so a server that fails does not stop the tools of the others.

`/mcp` shows each server and its status:

```text
files: connected (14 tools)
docs: failed: Failed to connect to MCP server: Version negotiation probe failed: connection refused
linear: failed: Not signed in. Run /connect linear.
```

In your own UI, read the same list from `session.snapshot().plugins['tanstack/mcp'].servers`. Each entry is an `McpServerStatus`:

- `name`: the name of the server.
- `status`: `connecting`, `connected`, `reconnecting`, or `failed`. A `failed` entry has an `error`.
- `toolCount`: how many tools the server gives the model.

### When a server stops

A `stdio` server can crash, and a connection can close. Then `/mcp` shows `files: reconnecting`, and the turns run without the tools of that server. `mcp()` connects a server without `oauth: true` again:

- It waits 0.5 s, then 1 s, then 2 s, and so on, up to 30 s between tries. A random part makes each wait shorter, so many sessions do not connect at the same moment.
- The waits start again at 0.5 s only after a connection stays open for 30 s. A server that crashes right after it connects waits longer each time.
- It tries until the server connects, or until the session closes. For a `stdio` server, it tries until the host stops the server.
- The next turn after the new connection has the tools again. All sessions that share a `stdio` server use the new process.
- A server that fails its first connect shows `failed`, and tries again with the same waits. A server that is not up yet, like a slow `npx`, gets its tools at a later turn.

An OAuth server, also one from `mcpConnector`, connects again at the next turn after its connection closes. After `tools/list_changed`, the next turn lists its tools again. If that list fails, the old list stays.

Some servers change their tools while they run. When a server sends `tools/list_changed`, the next turn lists the tools of that server again, and `/mcp` shows the new count.

## 3. Sign in to an OAuth server

1. Run `/connect linear` in the CLI.
2. The browser opens the Linear consent page. Approve it.
3. The CLI prints `Connected to linear.`
4. Ask for your issues. The next turn has the Linear tools.

Before sign-in, the model knows that Linear is not connected. If the user asks for Linear, the model tells them to run `/connect linear`.

The sign-in follows the MCP authorization spec:

- The connector reads the server's OAuth metadata and registers a client for this sign-in.
- It signs in with PKCE and a random `state`, and listens on `127.0.0.1` for one callback.
- The token and the registered client go into the `credentials` store of the host. The next start of the harness uses them, so the user signs in once.
- A new `/connect linear` replaces them. Nothing from the old sign-in stays.
- `/disconnect linear` deletes them.

Sometimes the server no longer accepts the sign-in, for example after the user removes the app in Linear. Then the turn runs without the Linear tools, and clients get a `harness.auth_required` event. The CLI prints `Sign in to linear. Run /connect linear.`, and the model tells the user to run `/connect linear`. If the server refuses the saved refresh token, the connector deletes the saved sign-in. It keeps a newer token that another session saved after this session read its own.

When a token expires, the MCP SDK of the session refreshes it. The connector saves the new token with [`credentials.refresh`](./auth#refresh-a-token):

- The token goes back to the scope where the sign-in was, so a tenant sign-in stays the tenant's.
- If the store has `getVersioned` and `setIf`, the save is a compare-and-set. When another session saved first, its token stays, and the next connect uses it.
- Each session still sends its own refresh request. So two sessions can refresh the same token at the same time.

The model never sees the token. To keep sign-ins after a restart, give the host a credential store. [Auth and connectors](./auth) shows one. With `oauth: true`, `headers` and `authProvider` do not apply.

## Choose which tools ask first

- A tool of an `oauth: true` server asks for approval before it runs, unless the server marks it read-only.
- The tools of the other servers run without a question.

Set `needsApproval` on a server to change this. `true` asks before every tool of the server. A function gets the MCP tool and returns `true` to ask:

```ts group=harness-mcp
export const careful = mcp({
  servers: {
    files: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      // Ask before each tool that the server does not mark read-only.
      needsApproval: (tool) => tool.annotations?.readOnlyHint !== true,
    },
    docs: { type: 'http', url: 'https://mcp.example.com/mcp', needsApproval: true },
  },
})
```

## Rename the tools of a server

Two servers can give a tool with the same name. Set `toolName` on a server to choose the names that the model sees. It gets the MCP tool and returns the name:

```ts group=harness-mcp
export const renamed = mcp({
  servers: {
    docs: {
      type: 'http',
      url: 'https://mcp.example.com/mcp',
      toolName: (tool) => `docs_v2_${tool.name}`,
    },
  },
})
```

When two servers still give the same tool name, the model gets the tool of the server that comes first in `servers`. The other tool is dropped, and the console shows one warning with the names of both servers.

To treat a clash as a config error, set `onDuplicateTool: 'error'`. Then the later server shows `failed` with an error that names both servers and the tool, and the model gets none of its tools. The other servers keep working:

```ts group=harness-mcp
export const strict = mcp({
  onDuplicateTool: 'error',
  servers: {
    docs: { type: 'http', url: 'https://mcp.example.com/mcp' },
  },
})
```

## Answer a question from a server

An MCP server can ask the user for input in the middle of a tool call. MCP calls this elicitation. The session asks the user, and the tool call waits for the answer.

- A form request becomes a question with the `message` and the requested `schema`.
- A URL request becomes a question with a `url`. The user opens the page, then answers. The session does not open the page.
- `mcp()` and `mcpConnector` both ask this way, for servers on MCP spec 2025 and on spec 2026-07-28.
- A spec 2025 request does not name the tool call that asks. So the session asks the user only when all the running calls of that server belong to one run. Else the server gets `decline`, so a question never goes to another user.
- One tool call can ask more than once. On spec 2026-07-28, one call can ask up to 5 times. One more request fails the tool call.
- The question is a live [wait](./waits) of the run that made the tool call. The host that runs the call keeps the thread until the answer comes. When that run stops, the wait ends `cancelled`.

Answer with `session.answer({ questionId, value })`, or from a [`HarnessClient`](./connect). The value tells the server what the user did:

| Value | The server gets |
| --- | --- |
| The form content, for example `{ city: 'Paris' }` | `accept` with that content |
| Any other value, for a URL request | `accept` |
| `{ action: 'decline' }` | `decline` |
| `{ action: 'cancel' }` | `cancel` |

`session.onQuestion` calls you the moment a server asks. This code answers every question with a city:

```ts group=harness-mcp
import type { HarnessSession } from '@tanstack/ai-harness'

export function answerWithCity(session: HarnessSession) {
  // Call the returned function to stop answering.
  return session.onQuestion(({ question }) =>
    session.answer({
      questionId: question.questionId,
      value: { city: 'Paris' },
    }),
  )
}
```

Open questions also stay in `session.snapshot().pendingWaits`, so a client that connects later still sees them.

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
- If a server does not connect in time, its open request closes, or its child process stops.
- A `stdio` server can take up to two times `timeoutMs` to connect. When the version check runs out of time, the SDK tries the older handshake, with its own `timeoutMs`.

An `http` server that does not connect in time shows this in `/mcp`:

```text
docs: failed: Failed to connect to MCP server: Version negotiation probe timed out after 10000ms
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

- A tool whose name is already taken is skipped. The first tool keeps the name. When two owners give the same name, clients get one `harness.plugin.warning` event that names both.
- If `discoverTools` throws, the turn runs without that plugin's tools, and clients get a `harness.plugin.warning` event.

## What you have now

- Tools from local, remote, and OAuth MCP servers, with the server name as a prefix.
- Servers that connect again after they stop, with a status in `/mcp` and in your UI.
- One browser sign-in per service, kept in your credential store.
- A question before the tools that change data.
- Server requests for input, asked as session questions.
