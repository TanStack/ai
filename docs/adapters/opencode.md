---
title: OpenCode
id: opencode-adapter
order: 14
description: "Use OpenCode as a chat backend in TanStack AI — agent harness with local tool execution, token-level streaming, stateful sessions, and tool bridging via @tanstack/ai-opencode."
keywords:
  - tanstack ai
  - opencode
  - opencode sdk
  - harness
  - agent
  - coding agent
  - adapter
---

The OpenCode adapter runs [OpenCode](https://opencode.ai) as a chat backend, driving it over its local HTTP server (`@opencode-ai/sdk`). Unlike HTTP provider adapters, this is a **harness adapter**: OpenCode runs its own agent loop and executes its own tools — shell commands, file reads and edits, search — locally on your server. Each `chat()` call runs one full harness turn; assistant text and reasoning stream as true token-level deltas, and the harness's tool activity streams back as already-resolved tool-call events your UI can render.

> **Server-only.** The adapter spawns (or attaches to) an `opencode serve` process, so it only works in a Node.js server environment — never in the browser. Treat it like giving OpenCode a shell on the machine it runs on, and configure permissions accordingly.

## Installation

```bash
npm install @tanstack/ai-opencode
```

The `opencode` CLI must be installed and its providers authenticated on the host:

```bash
npm install -g opencode-ai
opencode auth login
```

A runnable demo lives at [`examples/ts-react-coding-agent`](https://github.com/TanStack/ai/tree/main/examples/ts-react-coding-agent) — session resume, the harness tool timeline, permission modes, and tool bridging, wired into a React app.

## Models

OpenCode is provider-agnostic: it resolves any `provider/model` id its configured providers support. Address models as `provider/model` (the adapter splits on the first `/`):

```typescript
import { chat } from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";

const stream = chat({
  adapter: opencodeText("anthropic/claude-sonnet-4-5", {
    directory: "/path/to/project",
    permissionMode: "acceptEdits",
  }),
  messages: [{ role: "user", content: "Fix the failing test in utils.test.ts" }],
});
```

## Configuration

| Option                | Description                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `directory`           | Working directory for the harness session. Defaults to `process.cwd()`.                                                                                      |
| `baseUrl`             | Attach to an already-running `opencode serve` (e.g. `http://127.0.0.1:4096`) instead of spawning a new server per turn.                                       |
| `hostname`            | Hostname for the spawned server. Defaults to the SDK default (`127.0.0.1`).                                                                                   |
| `port`                | Port for the spawned server. Defaults to the SDK default (`4096`).                                                                                           |
| `permissionMode`      | `'default'` (bridged tools run, everything else that prompts is rejected), `'acceptEdits'` (also auto-approves file edits), or `'bypassPermissions'` (allow all). |
| `onPermissionRequest` | Custom permission handler; replaces the default policy entirely.                                                                                             |
| `config`              | Extra OpenCode config merged with the adapter's MCP and permission config.                                                                                    |

Per-call overrides — `sessionId`, `permissionMode`, `directory` — go through `modelOptions`.

## Permissions

OpenCode asks for permission before mutating files or running commands. A headless server has no one to answer those prompts, so the adapter applies a policy automatically — it never hangs a turn:

- **`'default'`** — bridged TanStack tools run; anything else that would prompt (edits, shell, web fetch) is rejected.
- **`'acceptEdits'`** — additionally auto-approves file-mutation requests (edit / write / patch).
- **`'bypassPermissions'`** — approves everything. Only use this against a sandbox or scratch directory.

Provide `onPermissionRequest` to implement your own policy (e.g. allow-list specific commands).

## Stateful Sessions

OpenCode sessions are stateful — the harness keeps the full working context (files read, commands run, conclusions reached) between turns. The adapter surfaces the session id of every fresh run as a custom stream event named `opencode.session-id`; thread it back via `modelOptions.sessionId` to resume. When resuming, only the latest user message is sent — the harness already holds the prior context.

Server endpoint:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // Extra fields the client puts in the connection `body` arrive here.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: opencodeText("anthropic/claude-sonnet-4-5", {
      directory: "/path/to/project",
      permissionMode: "acceptEdits",
    }),
    messages: params.messages,
    modelOptions: { sessionId },
  });

  return toServerSentEventsResponse(stream);
}
```

Client (React) — capture the session id from the custom event and send it back on subsequent requests:

```typescript
import { useState } from "react";
import { useChat } from "@tanstack/ai-react";
import { fetchServerSentEvents } from "@tanstack/ai-client";

function CodingAssistant() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat", () => ({
      body: { sessionId },
    })),
    onCustomEvent: (name, value) => {
      if (
        name === "opencode.session-id" &&
        typeof value === "object" &&
        value !== null &&
        "sessionId" in value &&
        typeof value.sessionId === "string"
      ) {
        setSessionId(value.sessionId);
      }
    },
  });

  // ... render messages; harness tool activity (bash, edit, read, ...)
  // arrives as regular tool-call parts with results.
}
```

Sessions live on the server that ran them, so resuming only works against the same server instance (or a shared `baseUrl`).

## Tools

Two kinds of tools flow through this adapter:

1. **Built-in harness tools** are executed by OpenCode itself and stream back as tool-call events with results already attached: `bash`, `edit`, `write`, `read`, `grep`, and the agent's running todo plan (surfaced as an `opencode.todo` custom event). Your code never executes them.

2. **Your TanStack tools** are bridged *into* the harness: the adapter starts a short-lived Streamable-HTTP MCP server on `127.0.0.1` for the duration of the turn and registers it with OpenCode. Define tools as usual with `toolDefinition().server()`; tool-call events come back under the names you registered (OpenCode prefixes MCP tools `tanstack_…` internally, which the adapter strips).

```typescript
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";

const lookupTicket = toolDefinition({
  name: "lookup_ticket",
  description: "Look up an issue ticket by id",
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => {
  return { ticketId, status: "open", title: "Crash on startup" };
});

const stream = chat({
  adapter: opencodeText("anthropic/claude-sonnet-4-5"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
});
```

**Client-side and approval-gated tools are not supported.** The harness executes tools inside a live process, which cannot pause across HTTP requests to wait for a browser round-trip or a human approval. Passing a tool without a server `execute()` implementation — or one marked `needsApproval` — fails fast with a descriptive error. Run those tools outside the harness with a regular provider adapter.

## Structured Output

`structuredOutput()` is best-effort: OpenCode's prompt API has no native JSON-schema channel, so the schema is embedded as a prompt instruction in a fresh, one-shot session and the final text is parsed (markdown fences are stripped when present). It works for finalization after a chat, but a plain provider adapter (e.g. `@tanstack/ai-openai`) is the better choice when structured extraction is the primary job — it's faster, deterministic, and doesn't spawn a harness.

## Limitations

- **Server-only (Node).** The adapter spawns or attaches to an `opencode serve` process.
- **The harness owns the agent loop.** TanStack's agent-loop strategies and per-iteration middleware don't apply inside a harness turn.
- **No sampling controls.** `temperature`-style options don't exist here.
- **Sessions are server-local.** Resume requires hitting the same server instance (or a shared `baseUrl`).
- **Cold starts.** Spawning a server per turn adds first-token latency; point the adapter at a long-lived `baseUrl` to avoid it.
