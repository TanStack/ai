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

You built a harness, but you do your work in Claude Code, Cursor, or another agent. You want to give work to your harness from there. These clients speak MCP. With `--mcp`, the CLI serves your harness as an MCP server. The client can then chat with the harness, answer its approvals, and run its agents and commands.

## 1. Install the MCP package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness-cli @tanstack/ai-mcp
vue: @tanstack/ai-harness-cli @tanstack/ai-mcp
solid: @tanstack/ai-harness-cli @tanstack/ai-mcp
svelte: @tanstack/ai-harness-cli @tanstack/ai-mcp
preact: @tanstack/ai-harness-cli @tanstack/ai-mcp
angular: @tanstack/ai-harness-cli @tanstack/ai-mcp
octane: @tanstack/ai-harness-cli @tanstack/ai-mcp
vanilla: @tanstack/ai-harness-cli @tanstack/ai-mcp

<!-- ::end:tabs -->

## 2. Add the harness to your client

Start from the entry file in [Run a harness in the terminal](./cli). With `--mcp`, it reads MCP messages on stdin and writes the answers on stdout.

For Claude Code, run this command one time:

```bash
claude mcp add --env OPENAI_API_KEY=your-key assistant -- npx tsx /path/to/cli.ts --mcp
```

For Claude Desktop, Cursor, and other clients with a JSON file, add the same command under `mcpServers`:

```json
{
  "mcpServers": {
    "assistant": {
      "command": "npx",
      "args": ["tsx", "/path/to/cli.ts", "--mcp"],
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
- `status`: show the status, the interrupts and questions that wait, the background agents, and the queued turns.

To answer the harness:

- `approve` and `reject`: answer every approval that waits.
- `resolve`: answer every interrupt that waits, in one call.
- `answer`: answer a question from a command or a plugin.

To run what the harness has:

- `agent_<name>`: one tool for each agent in `expose.agents`. It takes the agent input and returns the agent result.
- `command_<name>`: one tool for each command in `expose.commands`. The command `connect:notion` becomes the tool `command_connect_notion`.
- `tool_<name>`: one tool for each harness tool in `expose.tools`. It runs the tool with no model call and returns the result. See [Run a tool from a client](./connect#run-a-tool-from-a-client).

The harness exposes nothing by default. Add the agents, commands, and tools that an MCP client can run to `expose` in `defineHarness`. See [Choose what clients can change](./connect#choose-what-clients-can-change).

Two names can give the same tool name, for example `connect:notion` and `connect_notion`. Then the later one in name order gets a number: `command_connect_notion_2`. The description of each of these tools names its command or agent.

Every tool takes an optional `threadId`. Each thread is its own conversation. Without a `threadId`, a tool uses the `--thread` conversation (default `main`).

`chat` answers with JSON:

```json
{
  "status": "completed",
  "text": "You have three open tickets.",
  "interrupts": [],
  "questions": []
}
```

## Interrupts and questions

A turn can stop for an interrupt. The turn then waits for your answer. Each interrupt has a `kind`:

- `approval`: a tool call that needs your yes or no.
- `client-tool`: a tool that the client runs. The turn waits for the tool output.
- `generic`: a question from a middleware. The answer must match its `responseSchema`.

For an approval, the client asks you in its own window (MCP elicitation). Answer `yes` to run the tool. Any other answer rejects it.

In these cases, `chat` returns the interrupts with `status: "interrupted"`:

- The client cannot ask you.
- You close the question without an answer.
- An interrupt of another kind also waits.

```json
{
  "status": "interrupted",
  "text": "Here is the plan.",
  "interrupts": [
    {
      "id": "interrupt-1",
      "kind": "generic",
      "message": "Review the plan",
      "responseSchema": {
        "type": "object",
        "properties": { "note": { "type": "string" } },
        "required": ["note"]
      }
    }
  ],
  "questions": []
}
```

An approval and a client tool also have `tool` and `args`, the tool call that waits.

Then the client calls `approve`, `reject`, or `resolve`. That call waits for the turn to continue and returns the same JSON as `chat`. `approve` and `reject` answer approvals only. When an interrupt of another kind also waits, they refuse, and the client uses `resolve`.

`resolve` takes one decision for each interrupt that waits. This example answers a turn with one approval and one generic interrupt:

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
- For a generic interrupt, set `payload` to a value that matches its `responseSchema`.

`resolve` refuses a list that does not answer every interrupt. It also refuses a decision without the field that its kind needs.

To approve every tool call without a question, start the CLI with `--yes`. Use it only with tools that you trust. `--yes` answers approvals only, so other interrupts still come back in the result.

A command or a plugin can also ask you a question. The result then has `status: "waiting"` and the question in `questions`. The client calls `answer` with the question `id` as `questionId` and your `value`. `answer` waits for the work that asked, then returns its result.

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

With `--mcp`, the server can read the files in its working folder. Over HTTP (`/mcp`), the server reads no files, so send `url` or `data`.

When the work makes media, the results of `chat`, `approve`, `reject`, `resolve`, and `answer` include it:

- An image or an audio file up to 5 MB comes back inline, as MCP image or audio content.
- Any other file comes back as a `resource_link` to `harness-media://<threadId>/<id>`. The client reads the bytes with `resources/read`.
- The JSON result lists each file in `media`, with its `id`, `kind`, `name`, `mimeType`, `size`, and `uri`.

## Serve MCP over HTTP

If `@tanstack/ai-mcp` is installed, `--serve` also serves the MCP server at `/mcp`. The route uses the same bearer token as the other routes:

```bash
HARNESS_TOKEN=your-token npx tsx cli.ts --serve
claude mcp add --transport http assistant http://127.0.0.1:8787/mcp --header "Authorization: Bearer your-token"
```

A request without the token gets a 401. `--yes` works on this route too.

## Serve it from your own server

To put the MCP server in your own app, use `createHarnessMcpServer`. It opens sessions on your host and returns a server with a `fetch` handler:

```ts group=harness-mcp-server
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createHarnessMcpServer } from '@tanstack/ai-mcp/harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const server = await createHarnessMcpServer({
  host,
  harness: assistant,
  threadId: 'main',
  approvals: 'ask',
})

export async function handleMcp(request: Request) {
  const token = request.headers.get('authorization')
  if (token !== `Bearer ${process.env.MCP_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  return server.fetch(request)
}
```

Mount `handleMcp` on a route, for example `/mcp`. The options are:

- `threadId`: the conversation of a tool call without a `threadId`. Default `main`.
- `approvals`: `'ask'` (default) asks in the client, or returns the approvals when the client cannot ask. `'auto'` approves every tool call. Both answer approvals only.
- `filePaths`: the folders that a `path` attachment can read from. The real path of the file, after every symlink, must be inside one of them. Default: none, so the server refuses every `path` attachment.
- `name` and `version`: the MCP server name and version. Default: the harness name and `1.0.0`.

For a process that a client starts, serve the same server on stdio:

```ts group=harness-mcp-server
import { serveMCPStdio } from '@tanstack/ai-mcp/server/stdio'

serveMCPStdio(server)
```

## What you have now

- Your harness in Claude Code, Claude Desktop, Cursor, or any other MCP client.
- Approvals that the client asks you about, or answers with `approve` and `reject`.
- Every kind of interrupt, answered with one `resolve` call.
- The agents and commands of your harness as MCP tools.
- Files that the client sends with a message, and the media of each turn in the result.

Next: put the harness on a server with [Deploy a harness](./deploy).
