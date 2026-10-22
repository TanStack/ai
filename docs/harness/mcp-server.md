---
title: Use a harness from any MCP client
id: harness-mcp-server
order: 9
description: "Serve your harness as an MCP server. Chat with it, answer its approvals, and run its agents and commands from Claude Code, Claude Desktop, Cursor, or another agent."
keywords:
  - tanstack ai
  - harness
  - mcp
  - mcp server
  - claude code
  - cursor
---

You built a harness, but you do your work in Claude Code, Cursor, or another agent. You want to give work to your harness from there. These clients speak MCP. `createHarnessMcpServer` serves your harness as an MCP server. The client can then chat with the harness, answer its approvals, and run its agents and commands.

## 1. Install the MCP package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
vue: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
solid: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
svelte: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
preact: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
angular: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
octane: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence
vanilla: @tanstack/ai-harness @tanstack/ai-mcp @tanstack/ai-persistence

<!-- ::end:tabs -->

## 2. Serve the harness on stdio

Put this in `mcp.ts`. It opens sessions on your host, and reads MCP messages on stdin and writes the answers on stdout:

```ts group=harness-mcp-server
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createHarnessMcpServer } from '@tanstack/ai-mcp/harness'
import { serveMCPStdio } from '@tanstack/ai-mcp/server/stdio'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const server = await createHarnessMcpServer({
  host,
  harness: assistant,
  // One user on this machine, so no login.
  openAccess: true,
})

serveMCPStdio(server)
```

The host has no `access`, so the server needs `openAccess`. `true` opens each session with no user. `{ user }` opens each session as that one user.

For Claude Code, run this command one time:

```bash
claude mcp add --env OPENAI_API_KEY=your-key assistant -- npx tsx /path/to/mcp.ts
```

For Claude Desktop, Cursor, and other clients with a JSON file, add the same command under `mcpServers`:

```json
{
  "mcpServers": {
    "assistant": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp.ts"],
      "env": { "OPENAI_API_KEY": "your-key" }
    }
  }
}
```

- Claude Desktop keeps this in `claude_desktop_config.json`.
- Cursor keeps this in `.cursor/mcp.json`.

The client starts the process when it needs the harness. The process stops when the client closes stdin. In this mode, stdout carries only MCP messages. Write your own logs with `console.error`.

## 3. Use the tools

Ask the client to use the harness, for example: "Ask assistant to summarize my open tickets." The client calls these tools.

To talk to the harness:

- `chat`: send a message and wait for the answer. While a turn runs, the message waits in the queue. To send files too, see [Send files and get media](#send-files-and-get-media).
- `steer`: add a message to the running turn.
- `cancel`: cancel the running turn.
- `status`: show the status, every wait, the background agents, and the queued turns.

To answer the harness:

- `approve` and `reject`: answer every approval of the stopped turn.
- `resolve`: answer every interrupt of the stopped turn in one call, or the waits of a background agent run.
- `answer`: answer a question from a command, a durable tool, or an MCP server.

To run what the harness has:

- `agent_<name>`: one tool for each agent in `expose.agents`. It takes the agent input and returns the agent result.
- `command_<name>`: one tool for each command in `expose.commands`. The command `connect:notion` becomes the tool `command_connect_notion`.
- `tool_<name>`: one tool for each tool in `expose.tools`. It runs that one tool with no model turn. See [Run a tool without a model](./tool-runs).
- `append`: add records to the thread, when `expose.records` lists record types. The next turn reads them. See [Let a client add records](./session-log#let-a-client-add-records).

The harness exposes nothing by default. Add the agents, commands, tools, and record types that an MCP client can use to `expose` in `defineHarness`. See [Choose what clients can change](./connect#choose-what-clients-can-change).

Two names can give the same tool name, for example `connect:notion` and `connect_notion`. Then the later one in name order gets a number: `command_connect_notion_2`. The description of each of these tools names its command or agent.

Every tool takes an optional `threadId`. Each thread is its own conversation. Without a `threadId`, a tool uses the `threadId` option of the server (default `main`).

Because of that, the input of an agent, a command, or a tool cannot have its own `threadId` field. `createHarnessMcpServer` throws when one does. Give that field another name, for example `ticketThreadId`.

`chat` answers with JSON:

```json
{
  "status": "completed",
  "text": "You have three open tickets.",
  "interrupts": [],
  "questions": [],
  "waits": []
}
```

## Waits

The work of a tool call can stop for a [wait](./waits). The result lists the open waits of that work in `waits`. Each wait has a `kind`:

- `approval`: a tool call that needs your yes or no.
- `question`: an answer that fits the `schema` of the wait, for example from the `question` tool or a `step.ask`.
- `sign-in`: a connector that needs you to sign in.
- `client-tool`: a tool that the client runs. The work waits for the tool output.
- `human`: a person who takes over, from an interrupt of `defineInterrupt`.

The result also splits the waits by how you answer them:

- `interrupts`: the waits of a stopped turn. Each one has `id`, `kind`, `message`, and `responseSchema`. An approval and a client tool also have `tool` and `args`, the tool call that waits.
- `questions`: the questions that a command, a durable tool, or an MCP server asks while it runs.

For an approval, the client asks you in its own window (MCP elicitation). Answer `yes` to run the tool. Any other answer rejects it.

In these cases, `chat` returns the interrupts with `status: "interrupted"`:

- The client cannot ask you.
- You close the question without an answer.
- A wait of another kind also waits.

```json
{
  "status": "interrupted",
  "text": "Here is the plan.",
  "interrupts": [
    {
      "id": "interrupt-1",
      "kind": "human",
      "message": "Review the plan",
      "responseSchema": {
        "type": "object",
        "properties": { "note": { "type": "string" } },
        "required": ["note"]
      }
    }
  ],
  "questions": [],
  "waits": [
    {
      "waitId": "interrupt-1",
      "kind": "human",
      "runId": "run-1",
      "message": "Review the plan",
      "schema": {
        "type": "object",
        "properties": { "note": { "type": "string" } },
        "required": ["note"]
      }
    }
  ]
}
```

Then the client calls `approve`, `reject`, or `resolve`. That call waits for the turn to continue and returns the same JSON as `chat`. `approve` and `reject` answer approvals only. When a wait of another kind also waits, they refuse, and the client uses `resolve`.

`resolve` takes one decision for each interrupt that waits. This example answers a turn with one approval and one `human` wait:

```json
{
  "decisions": [
    { "interruptId": "approval-1", "approved": true },
    { "interruptId": "interrupt-1", "payload": { "note": "Ship it." } }
  ]
}
```

- For an approval, set `approved`. `true` runs the tool, and `false` rejects it.
- For a client tool, set `payload` to the tool output.
- For any other kind, set `payload` to a value that matches its schema.

`resolve` refuses a list that does not answer every interrupt. It also refuses a decision without the field that its kind needs.

To approve every tool call without a question, set `approvals: 'auto'`. Use it only with tools that you trust. It answers approvals only, so other waits still come back in the result.

### Questions and background agents

Some work keeps running while it waits. The result then has `status: "waiting"`:

- A question in `questions`: the client calls `answer` with the question `id` as `questionId` and your `value`.
- A wait of a background agent run (an approval of `permissions()`, for example): the client calls `resolve` with one decision for each wait of that run. The `interruptId` is the `waitId`.

`answer` and `resolve` wait for the work, then return its result. The `status` tool lists every wait, and each background agent with `status: "running"` or `"waiting"`.

## Send files and get media

`chat` takes `attachments`, the files to send with the message. Each attachment is one of these:

- `{ path }`: a file on the machine of the server. The file must be inside a folder that the server can read.
- `{ url, mimeType }`: a URL that goes to the model as it is. The server does not download it. `mimeType` is optional when the URL ends in a known file extension.
- `{ data, mimeType }`: the bytes of the file in base64.

Each attachment also takes an optional `name`. This `chat` call sends a screenshot:

```json
{
  "message": "What is wrong in this screenshot?",
  "attachments": [{ "path": "./bug.png" }]
}
```

The server reads a `path` only inside the `filePaths` option. By default it reads no files, so send `url` or `data`.

When the work makes media, the results of `chat`, `approve`, `reject`, `resolve`, and `answer` include it:

- An image or an audio file up to 5 MB comes back inline, as MCP image or audio content.
- Any other file comes back as a `resource_link` to `harness-media://<threadId>/<id>`. The client reads the bytes with `resources/read`.
- The JSON result lists each file in `media`, with its `id`, `kind`, `name`, `mimeType`, `size`, and `uri`.

## Serve it over HTTP

Several people use the server over HTTP, so each request needs its user. Give the host [`access`](./access), and leave out `openAccess`. The server then reads the user of each HTTP request with `getUser`:

```ts group=harness-mcp-server-http
import { createHarnessHost, defineHarness, membersOnly } from '@tanstack/ai-harness'
import { createHarnessMcpServer } from '@tanstack/ai-mcp/harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

// Your own token check: a bearer token to a user.
const users = new Map([['Bearer token-ada', { id: 'ada', tenantId: 'acme' }]])

const host = createHarnessHost({
  persistence: memoryPersistence(),
  access: {
    getUser: ({ request }) => users.get(request.headers.get('authorization') ?? '') ?? null,
    rules: membersOnly(),
  },
})

const server = await createHarnessMcpServer({ host, harness: assistant })

// Mount it on a route of your app, for example `/mcp`.
export const handleMcp = (request: Request) => server.fetch(request)
```

Each request runs as its user, and the host checks each tool call. A user reaches only the threads and the media that `isAllowed` allows.

- A request that `getUser` refuses gets `401`. A refused action comes back as a tool error.
- A server on a host with `access` works over HTTP only. Over stdio, it throws.
- It opens no session at the start, so it lists only the agents of the harness definition. The commands and the agents that plugins add get no tool on this server.

Then add it to Claude Code:

```bash
claude mcp add --transport http assistant https://your-app.example.com/mcp --header "Authorization: Bearer your-token"
```

`createHarnessMcpServer` takes these options next to `host` and `harness`:

- `threadId`: the conversation of a tool call without a `threadId`. Default `main`.
- `approvals`: `'ask'` (default) asks in the client, or returns the approvals when the client cannot ask. `'auto'` approves every tool call. Both answer approvals only.
- `filePaths`: the folders that a `path` attachment can read from. The real path of the file, after every symlink, must be inside one of them. Default: none, so the server refuses every `path` attachment.
- `openAccess`: for a host with no `access` only. `true` opens each session with no user, and `{ user }` opens each session as that user.
- `name` and `version`: the MCP server name and version. Default: the harness name and `1.0.0`.

## What you have now

- Your harness in Claude Code, Claude Desktop, Cursor, or any other MCP client.
- Approvals that the client asks you about, or answers with `approve` and `reject`.
- Every kind of wait in one list, answered with `resolve` or `answer`.
- The agents, commands, and tools of your harness as MCP tools.
- Records that the client adds to a thread with `append`.
- Files that the client sends with a message, and the media of each turn in the result.
