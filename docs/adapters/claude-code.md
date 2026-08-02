---
title: Claude Code
id: claude-code-adapter
order: 11
description: "Use Claude Code as a chat backend in TanStack AI — agent harness with local tool execution, stateful coding sessions, and tool bridging via @tanstack/ai-claude-code."
keywords:
  - tanstack ai
  - claude code
  - claude agent sdk
  - anthropic
  - harness
  - agent
  - coding agent
  - adapter
---

The Claude Code adapter runs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (via the `@anthropic-ai/claude-agent-sdk`) as a chat backend. Unlike HTTP provider adapters, this is a **harness adapter**: Claude Code runs its own agent loop and executes its own tools — bash, file reads and edits, glob/grep search, web search — locally on your server. Each `chat()` call runs one full harness turn; the harness's tool activity streams back as already-resolved tool-call events your UI can render.

> **Server-only.** The harness spawns the Claude Code runtime as a subprocess, so this adapter only works in a Node.js server environment — never in the browser. Treat it like giving Claude a shell on the machine it runs on, and configure permissions accordingly.

## Installation

```bash
npm install @tanstack/ai-claude-code
```

A runnable demo lives at [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) — switch the harness (Claude Code, Codex, OpenCode, Grok Build) and sandbox provider per run, with session resume, the harness tool timeline, permission modes, and tool bridging, wired into a TanStack Start app.

## Authentication

The harness resolves credentials the same way Claude Code does:

- `ANTHROPIC_API_KEY` in the server's environment (or the `apiKey` config option), or
- an existing Claude subscription login on the machine (`claude login`).

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";

const stream = chat({
  adapter: claudeCodeText("claude-opus-4-8", {
    cwd: "/path/to/project",
    permissionMode: "acceptEdits",
  }),
  messages: [{ role: "user", content: "Fix the failing test in utils.test.ts" }],
});
```

## Configuration

| Option                       | Description                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                        | Working directory for the harness session. Defaults to `process.cwd()`.                                                                            |
| `permissionMode`             | Claude Code permission mode (`'default'`, `'acceptEdits'`, `'bypassPermissions'`, `'plan'`, `'dontAsk'`, `'auto'`). See the permissions note below. |
| `allowedTools`               | Built-in tools the harness may use without prompting (e.g. `['Read', 'Grep', 'Bash(npm test:*)']`).                                                |
| `disallowedTools`            | Built-in tools removed from the harness entirely.                                                                                                  |
| `maxTurns`                   | Maximum harness-internal turns per run.                                                                                                            |
| `systemPromptMode`           | `'append'` (default) keeps Claude Code's preset system prompt and appends your `systemPrompts`; `'replace'` sends yours as the entire prompt.       |
| `mcpServers`                 | Extra MCP servers passed through to the harness untouched.                                                                                         |
| `apiKey`                     | Anthropic API key for the harness subprocess.                                                                                                       |
| `env`                        | Extra environment variables for the harness subprocess.                                                                                            |
| `pathToClaudeCodeExecutable` | Use a specific Claude Code executable instead of the SDK's bundled one.                                                                             |
| `streamPartials`             | Emit true token-level text deltas (default `true`).                                                                                                 |
| `canUseTool`                 | Custom permission handler; replaces the adapter's default handler.                                                                                  |
| `settingSources`             | Claude Code settings tiers to load. Default `['project']`: the `cwd`'s CLAUDE.md and project settings apply, but user-level config on the host (`~/.claude` plugins, hooks, skills) is ignored. Pass `['user', 'project', 'local']` for CLI-equivalent behavior, or `[]` for full isolation. |

**Permissions on headless servers.** Without an explicit `permissionMode` or `canUseTool`, the adapter installs a safe default handler: bridged TanStack tools always run, and any built-in tool call that would normally prompt a human is denied with guidance instead of hanging the request. To let the harness edit files or run commands, set `permissionMode: 'acceptEdits'` / `'bypassPermissions'`, or enumerate `allowedTools`.

## Stateful Sessions

Claude Code sessions are stateful — the harness keeps the full working context (files read, commands run, conclusions reached) between turns. The adapter surfaces the session id of every run as a custom stream event named `claude-code.session-id`; thread it back via `modelOptions.sessionId` to resume the session. When resuming, only the latest user message is sent — the harness already holds the prior context.

Server endpoint:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // Extra fields the client puts in the connection `body` arrive here.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: claudeCodeText("claude-opus-4-8", {
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
        name === "claude-code.session-id" &&
        typeof value === "object" &&
        value !== null &&
        "sessionId" in value &&
        typeof value.sessionId === "string"
      ) {
        setSessionId(value.sessionId);
      }
    },
  });

  // ... render messages; harness tool activity (Bash, Edit, Read, ...)
  // arrives as regular tool-call parts with their results attached.
}
```

Sessions are stored on the machine that ran them (`~/.claude/projects/`), so resuming only works on the same server instance. Pass `modelOptions: { forkSession: true }` alongside `sessionId` to branch a session instead of continuing it.

## Tools

Two kinds of tools flow through this adapter:

1. **Built-in harness tools** (`Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`, ...) are executed by Claude Code itself. Their activity streams back as tool-call events with results already attached, so `useChat` UIs render them with no extra wiring — but your code never executes them.

2. **Your TanStack tools** are bridged *into* the harness as an in-process MCP server. Define them as usual with `toolDefinition().server()`; the model sees them as `mcp__tanstack__<name>` and the adapter strips the prefix on the way back out, so events match the names you registered.

```typescript
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";

const lookupTicket = toolDefinition({
  name: "lookup_ticket",
  description: "Look up an issue ticket by id",
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => {
  return { ticketId, status: "open", title: "Crash on startup" };
});

const stream = chat({
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
});
```

**Client-side and approval-gated tools are not supported.** The harness executes tools inside a live subprocess, which cannot pause across HTTP requests to wait for a browser round-trip or a human approval. Passing a tool without a server `execute()` implementation — or one marked `needsApproval` — fails fast with a descriptive error. Run those tools outside the harness with a regular provider adapter.

## Structured Output

`structuredOutput()` uses the harness's native JSON-schema output format in a one-shot run (single turn, no tools). It works for finalization after a chat, but a plain provider adapter (e.g. `@tanstack/ai-anthropic`) is the better choice when structured extraction is the primary job — it's faster and doesn't spawn a subprocess.

## Limitations

- **Server-only (Node).** The harness spawns a subprocess; Windows support is untested.
- **The harness owns the agent loop.** TanStack's agent-loop strategies and per-iteration middleware don't apply inside a harness turn; `maxTurns` is the equivalent control.
- **No sampling controls.** `temperature`-style options don't exist here.
- **Sessions are machine-local.** Resume requires hitting the same server instance.
- **Cold starts.** Each call spawns a harness turn; expect higher first-token latency than HTTP adapters.
