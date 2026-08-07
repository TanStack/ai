---
title: Claude Code
id: claude-code-adapter
order: 11
description: "Claude Code harness adapter — local agent loop, tools, and sessions via @tanstack/ai-claude-code."
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

If you need Claude Code as a chat backend → **server-only** harness: install, auth, call `claudeCodeText(model, { cwd, permissionMode })`.

> Spawns a subprocess. Never run in the browser. Treat it as shell access on that machine.

Demos: [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare), [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web).

## Install

```bash
npm install @tanstack/ai-claude-code
```

## Auth

1. `ANTHROPIC_API_KEY` (or `apiKey` config), or
2. Existing `claude login` on the machine

## Do this

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

| Option | Description |
| --- | --- |
| `cwd` | Working dir (default `process.cwd()`) |
| `permissionMode` | `'default'` \| `'acceptEdits'` \| `'bypassPermissions'` \| `'plan'` \| `'dontAsk'` \| `'auto'` |
| `allowedTools` | Tools that run without prompt (e.g. `['Read', 'Grep', 'Bash(npm test:*)']`) |
| `disallowedTools` | Tools removed entirely |
| `maxTurns` | Max harness-internal turns |
| `systemPromptMode` | `'append'` (default) or `'replace'` |
| `mcpServers` | Extra MCP servers |
| `apiKey` | Anthropic key for subprocess |
| `env` | Extra env for subprocess |
| `pathToClaudeCodeExecutable` | Override bundled executable |
| `streamPartials` | Token-level deltas (default `true`) |
| `canUseTool` | Custom permission handler |
| `settingSources` | Default `['project']`. Pass `['user', 'project', 'local']` for CLI-equivalent, `[]` for isolation |

**Headless permissions:** without `permissionMode` / `canUseTool`, bridged TanStack tools run; built-in tools that would prompt humans are denied (no hang). Set `permissionMode: 'acceptEdits'` or `'bypassPermissions'`, or list `allowedTools`, to allow edits/commands.

## Stateful sessions

1. Capture `claude-code.session-id` CUSTOM event.
2. Pass `modelOptions.sessionId` on the next turn.
3. Send only the latest user message.

**Server:**

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

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

**Client:**

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

  // harness tools (Bash, Edit, Read, ...) arrive as tool-call parts
}
```

Sessions live under `~/.claude/projects/` — same server instance only. Fork with `modelOptions: { forkSession: true }` + `sessionId`.

## Tools

1. **Harness tools** (`Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`, …) — Claude Code runs them; events already have results.
2. **Your tools** — bridge via in-process MCP as `mcp__tanstack__<name>` (prefix stripped on the way out).

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

**No client-side or `needsApproval` tools** — fails fast. Use a regular provider adapter for those.

## Structured output

`structuredOutput()` uses native JSON schema in a one-shot run. Prefer `@tanstack/ai-anthropic` when extraction is the main job.

## Notes

- Server-only (Node); Windows untested
- Harness owns the agent loop — no TanStack loop strategies / per-iteration middleware inside a turn
- No sampling controls
- Sessions machine-local
- Higher cold-start latency than HTTP adapters
