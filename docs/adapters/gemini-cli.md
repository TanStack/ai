---
title: Gemini CLI
id: gemini-cli-adapter
order: 13
description: "Use Gemini CLI as a chat backend in TanStack AI — agent harness with local tool execution, stateful coding sessions, and tool bridging via @tanstack/ai-gemini-cli."
keywords:
  - tanstack ai
  - gemini cli
  - agent client protocol
  - acp
  - google
  - harness
  - agent
  - coding agent
  - adapter
---

The Gemini CLI adapter runs [Gemini CLI](https://github.com/google-gemini/gemini-cli) as a chat backend, driving it over the [Agent Client Protocol](https://agentclientprotocol.com) (`gemini --acp`) — the same interface editors like Zed use to embed it. Unlike HTTP provider adapters, this is a **harness adapter**: Gemini CLI runs its own agent loop and executes its own tools — shell commands, file reads and edits, search — locally on your server. Each `chat()` call runs one full harness turn; assistant text and thinking stream as true token-level deltas, and the harness's tool activity streams back as already-resolved tool-call events your UI can render.

> **Server-only.** The adapter spawns the `gemini` CLI as a subprocess, so it only works in a Node.js server environment — never in the browser. Treat it like giving Gemini a shell on the machine it runs on, and configure permissions accordingly.

## Installation

```bash
npm install @tanstack/ai-gemini-cli
```

The `gemini` CLI itself is a prerequisite — it is **not** bundled:

```bash
npm install -g @google/gemini-cli
```

A runnable demo lives at [`examples/ts-react-coding-agent`](https://github.com/TanStack/ai/tree/main/examples/ts-react-coding-agent) — session resume, the harness tool timeline, permission modes, and tool bridging, wired into a React app.

## Authentication

The harness resolves credentials the same way Gemini CLI does:

- an existing Google login on the machine (run `gemini` once interactively), or
- `GEMINI_API_KEY` in the server's environment (pass it via the `env` config option if needed).

**Headless ACP auth.** When driven over ACP, Gemini CLI can't pop an
interactive auth picker, so it needs to be told which method to use. Set
`authMethodId` to one of the methods the CLI advertises — commonly
`'oauth-personal'` (Log in with Google), `'gemini-api-key'`, or `'vertex-ai'`.
The adapter selects it (via the ACP `authenticate` call) before opening the
session, and fails fast with the list of available methods if the one you
asked for isn't offered. Some setups also require trusting the working
directory in headless mode — set `GEMINI_CLI_TRUST_WORKSPACE=true` (or pass
`--skip-trust` via `extraArgs`) when the CLI refuses an untrusted folder.

```typescript
import { geminiCliText } from "@tanstack/ai-gemini-cli";

const adapter = geminiCliText("gemini-3-pro-preview", {
  cwd: "/path/to/project",
  authMethodId: "oauth-personal", // reuse the machine's Google login
});
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { geminiCliText } from "@tanstack/ai-gemini-cli";

const stream = chat({
  adapter: geminiCliText("gemini-3-pro-preview", {
    cwd: "/path/to/project",
    permissionMode: "acceptEdits",
  }),
  messages: [{ role: "user", content: "Fix the failing test in utils.test.ts" }],
});
```

## Configuration

| Option                | Description                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `cwd`                 | Working directory for the harness session. Defaults to `process.cwd()`.                                                |
| `executablePath`      | Path to the Gemini CLI executable. Defaults to `gemini` on `PATH`.                                                     |
| `extraArgs`           | Extra CLI arguments appended after `--acp` (e.g. `['--sandbox']`).                                                     |
| `env`                 | Extra environment variables merged over `process.env` for the subprocess.                                              |
| `permissionMode`      | `'default'`, `'acceptEdits'`, or `'bypassPermissions'`. See the permissions note below.                                 |
| `onPermissionRequest` | Custom permission handler; replaces the adapter's default policy.                                                      |
| `authMethodId`        | ACP auth method to select before the session starts, e.g. `'oauth-personal'`, `'gemini-api-key'`, `'vertex-ai'`. See Authentication. |

Per-call overrides — `sessionId`, `permissionMode`, `cwd`, `authMethodId` — go through `modelOptions`.

**Permissions on headless servers.** ACP routes the harness's tool-approval questions back to the embedding application. Without a custom `onPermissionRequest`, the adapter installs a safe default policy that always answers immediately: bridged TanStack tools are approved, `'acceptEdits'` additionally approves file-mutation tools (edit / move / delete kinds), `'bypassPermissions'` approves everything, and anything else is rejected — a headless server must never hang on a question only an interactive user could answer.

## Stateful Sessions

Gemini CLI sessions are stateful — the harness keeps the full working context between turns. The adapter surfaces the session id of every run as a custom stream event named `gemini-cli.session-id`; thread it back via `modelOptions.sessionId` to resume the session. When resuming, only the latest user message is sent — the harness already holds the prior context. If the installed CLI can't load the session (older CLI, different machine), the adapter transparently falls back to a fresh session seeded with the flattened transcript, and the new session id is emitted so the client can re-pin it.

Server endpoint:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { geminiCliText } from "@tanstack/ai-gemini-cli";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // Extra fields the client puts in the connection `body` arrive here.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: geminiCliText("gemini-3-pro-preview", {
      cwd: "/path/to/project",
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
        name === "gemini-cli.session-id" &&
        typeof value === "object" &&
        value !== null &&
        "sessionId" in value &&
        typeof value.sessionId === "string"
      ) {
        setSessionId(value.sessionId);
      }
    },
  });

  // ... render messages; harness tool activity (execute, edit, read, ...)
  // arrives as regular tool-call parts with their results attached.
}
```

Sessions are stored on the machine that ran them (under `~/.gemini/tmp/`), so resuming only works on the same server instance.

## Tools

Two kinds of tools flow through this adapter:

1. **Built-in harness tools** (shell, file edits, reads, search, web fetch, ...) are executed by Gemini CLI itself. Their activity streams back as tool-call events — named by their ACP tool kind (`execute`, `edit`, `read`, `search`, ...), with the human-readable title in the arguments — and results attached, so `useChat` UIs render them with no extra wiring. Your code never executes them. The harness's running plan is surfaced as a CUSTOM `gemini-cli.plan` event.

2. **Your TanStack tools** are bridged *into* the harness: the adapter starts a short-lived Streamable-HTTP MCP server on `127.0.0.1` for the duration of the turn and registers it with the ACP session. Define tools as usual with `toolDefinition().server()`; tool-call events come back under the names you registered, and the default permission policy auto-approves them.

```typescript
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { geminiCliText } from "@tanstack/ai-gemini-cli";

const lookupTicket = toolDefinition({
  name: "lookup_ticket",
  description: "Look up an issue ticket by id",
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => {
  return { ticketId, status: "open", title: "Crash on startup" };
});

const stream = chat({
  adapter: geminiCliText("gemini-3-pro-preview"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
});
```

**Client-side and approval-gated tools are not supported.** The harness executes tools inside a live subprocess, which cannot pause across HTTP requests to wait for a browser round-trip or a human approval. Passing a tool without a server `execute()` implementation — or one marked `needsApproval` — fails fast with a descriptive error. Run those tools outside the harness with a regular provider adapter.

## Structured Output

ACP has no native JSON-schema output channel, so `structuredOutput()` is best-effort: the schema is embedded as a prompt instruction in a fresh one-shot session and the final text is parsed (markdown fences are stripped when present). For production structured extraction, use a plain provider adapter (e.g. `@tanstack/ai-gemini`) — it's faster, schema-enforced, and doesn't spawn a subprocess.

## Limitations

- **Server-only (Node)**, and the `gemini` CLI must be installed and authenticated on the host.
- **Token usage is usually unavailable.** ACP only recently added usage reporting; when the CLI doesn't report it, `RUN_FINISHED` carries no usage.
- **The harness owns the agent loop.** TanStack's agent-loop strategies and per-iteration middleware don't apply inside a harness turn.
- **No sampling controls.** `temperature`-style options don't exist here.
- **Sessions are machine-local.** Resume requires hitting the same server instance (with graceful fallback to a fresh transcript-seeded session).
- **Cold starts.** Each call spawns the CLI; expect higher first-token latency than HTTP adapters.
- **ACP is young.** Gemini CLI's ACP mode is still stabilizing; pin a known-good CLI version in production.
