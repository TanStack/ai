---
title: Codex
id: codex-adapter
order: 12
description: "Use OpenAI Codex as a chat backend in TanStack AI — agent harness with local tool execution, stateful coding sessions, and tool bridging via @tanstack/ai-codex."
keywords:
  - tanstack ai
  - codex
  - codex sdk
  - openai
  - harness
  - agent
  - coding agent
  - adapter
---

The Codex adapter runs [OpenAI Codex](https://developers.openai.com/codex) (via the `@openai/codex-sdk`) as a chat backend. Unlike HTTP provider adapters, this is a **harness adapter**: Codex runs its own agent loop and executes its own tools — shell commands, file changes, web search — locally on your server, inside its sandbox. Each `chat()` call runs one full harness turn; the harness's tool activity streams back as already-resolved tool-call events your UI can render.

> **Server-only.** The harness spawns the Codex runtime (bundled with the SDK) as a subprocess, so this adapter only works in a Node.js server environment — never in the browser. The sandbox mode is the safety boundary; configure it deliberately.

## Installation

```bash
npm install @tanstack/ai-codex
```

A runnable demo lives at [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare) — pick Claude Code, Codex, or Grok Build in the UI, with session resume, the harness tool timeline, and tool bridging, wired into a TanStack Start app on Workers. For the same wiring on plain Node with durable, refresh-surviving runs (Claude Code on Docker), see [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) — swapping in this adapter is a one-line change (`src/sandbox-agent.ts`).

## Authentication

The harness resolves credentials the same way the Codex CLI does:

- the `apiKey` config option (exported to the subprocess as `CODEX_API_KEY`; usage-based billing), or
- an existing ChatGPT login on the machine (`codex login`).

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";

const stream = chat({
  adapter: codexText("gpt-5.1-codex", {
    cwd: "/path/to/project",
    sandboxMode: "workspace-write",
  }),
  messages: [{ role: "user", content: "Fix the failing test in utils.test.ts" }],
});
```

## Configuration

| Option                 | Description                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                  | Working directory for the harness session. Defaults to `process.cwd()`.                                                                       |
| `sandboxMode`          | Codex sandbox: `'read-only'`, `'workspace-write'`, or `'danger-full-access'`. Default is `'workspace-write'` on local-process and Docker. Default is `'danger-full-access'` on Daytona and Cloudflare, because those providers cannot create a nested bubblewrap namespace. Isolation is then the outer VM plus `defineSandboxPolicy`. |
| `approvalPolicy`       | Codex approval policy. Defaults to `'never'` — headless runs have no approval UI, so anything else can stall a turn.                           |
| `modelReasoningEffort` | `'minimal'` \| `'low'` \| `'medium'` \| `'high'` \| `'xhigh'`.                                                                                 |
| `skipGitRepoCheck`     | Skip the harness's git-repo safety check. Defaults to `true` (server adapters routinely point at scratch directories).                         |
| `networkAccessEnabled` | Allow network access inside the `workspace-write` sandbox.                                                                                     |
| `webSearchMode`        | `'disabled'` \| `'cached'` \| `'live'`.                                                                                                        |
| `additionalDirectories`| Extra writable directories beyond `cwd`.                                                                                                       |
| `apiKey`               | OpenAI API key for the harness subprocess.                                                                                                     |
| `baseUrl`              | Override the Codex backend base URL.                                                                                                           |
| `codexPathOverride`    | Use a specific codex executable instead of the SDK's bundled binary.                                                                           |
| `env`                  | Environment variables for the subprocess. When set, `process.env` is **not** inherited (Codex SDK semantics).                                  |
| `config`               | Extra `--config key=value` overrides passed to the Codex CLI (e.g. additional `mcp_servers` entries).                                          |

Per-call overrides — `sessionId`, `sandboxMode`, `approvalPolicy`, `modelReasoningEffort`, `workingDirectory`, `skipGitRepoCheck` — go through `modelOptions`.

## Stateful Sessions

Codex threads are stateful — the harness keeps the full working context (files read, commands run, conclusions reached) between turns. The adapter surfaces the thread id of every fresh run as a custom stream event named `codex.session-id`; thread it back via `modelOptions.sessionId` to resume. When resuming, only the latest user message is sent — the harness already holds the prior context.

Server endpoint:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // Extra fields the client puts in the connection `body` arrive here.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: codexText("gpt-5.1-codex", {
      cwd: "/path/to/project",
      sandboxMode: "workspace-write",
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
        name === "codex.session-id" &&
        typeof value === "object" &&
        value !== null &&
        "sessionId" in value &&
        typeof value.sessionId === "string"
      ) {
        setSessionId(value.sessionId);
      }
    },
  });

  // ... render messages; harness tool activity (command_execution,
  // file_change, ...) arrives as regular tool-call parts with results.
}
```

Sessions are stored on the machine that ran them (`~/.codex/sessions/`), so resuming only works on the same server instance.

## Tools

Two kinds of tools flow through this adapter:

1. **Built-in harness tools** are executed by Codex itself and stream back as tool-call events with results already attached: `command_execution` (shell), `file_change` (patches), `web_search`, and `todo_list` (the agent's running plan). Your code never executes them.

2. **Your TanStack tools** are bridged *into* the harness: the adapter starts a short-lived Streamable-HTTP MCP server on `127.0.0.1` for the duration of the turn and points Codex at it. Define tools as usual with `toolDefinition().server()`; tool-call events come back under the names you registered.

```typescript
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";

const lookupTicket = toolDefinition({
  name: "lookup_ticket",
  description: "Look up an issue ticket by id",
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => {
  return { ticketId, status: "open", title: "Crash on startup" };
});

const stream = chat({
  adapter: codexText("gpt-5.1-codex"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
});
```

**Client-side and approval-gated tools are not supported.** The harness executes tools inside a live subprocess, which cannot pause across HTTP requests to wait for a browser round-trip or a human approval. Passing a tool without a server `execute()` implementation — or one marked `needsApproval` — fails fast with a descriptive error. Run those tools outside the harness with a regular provider adapter.

## Structured Output

Pass `outputSchema` on `chat()`. Codex runs one harness turn and constrains the last message with `--output-schema`. Tool activity and earlier assistant text still stream. The last message is parsed as the schema object and arrives as `structured-output.complete`.

```ts
import { chat } from "@tanstack/ai"
import { codexText } from "@tanstack/ai-codex"
import { defineSandbox, withSandbox } from "@tanstack/ai-sandbox"
import { dockerSandbox } from "@tanstack/ai-sandbox-docker"
import { z } from "zod"

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
})

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
})

const report = await chat({
  adapter: codexText("gpt-5.3-codex"),
  messages: [{ role: "user", content: "Review this repo." }],
  outputSchema: Report,
  middleware: [withSandbox(sandbox)],
})

report.summary
```

On the client, pass the same schema to `useChat` and read `final`. `partial` stays empty until the end.

```tsx
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { z } from "zod"

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
})

function ReportView() {
  const { final, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/repo-report"),
    outputSchema: Report,
  })

  if (isLoading) return <p>The agent is inspecting the repo.</p>
  if (!final) return null
  return <p>{final.summary}</p>
}
```

If you only need to extract JSON from a prompt and do not need a sandbox, use `@tanstack/ai-openai`. That path is faster.

Full walkthrough, including the client: [Harness Agents](../structured-outputs/harnesses).

## Limitations

- **No token-level text streaming.** The Codex SDK reports assistant text and reasoning only as completed items, so text arrives message-at-a-time. Tool activity (commands starting/finishing) still streams live, which keeps the UI feeling alive during long turns.
- **Server-only (Node).** The harness spawns a subprocess.
- **The harness owns the agent loop.** TanStack's agent-loop strategies and per-iteration middleware don't apply inside a harness turn.
- **No sampling controls.** `temperature`-style options don't exist here.
- **Sessions are machine-local.** Resume requires hitting the same server instance.
- **Cold starts.** Each call spawns a harness turn; expect higher first-token latency than HTTP adapters.
