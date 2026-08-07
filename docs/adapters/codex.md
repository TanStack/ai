---
title: Codex
id: codex-adapter
order: 12
description: "OpenAI Codex harness adapter — local agent loop, tools, and sessions via @tanstack/ai-codex."
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

If you need OpenAI Codex as a chat backend → **server-only** harness: install, auth, call `codexText(model, { cwd, sandboxMode })`.

> Spawns Codex runtime as a subprocess. Never in the browser. Configure sandbox deliberately.

Demos: [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare), [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) (swap adapter in `src/sandbox-agent.ts`).

## Install

```bash
npm install @tanstack/ai-codex
```

## Auth

1. `apiKey` config → `CODEX_API_KEY` on subprocess (usage billing), or
2. Existing `codex login` on the machine

## Do this

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

| Option | Description |
| --- | --- |
| `cwd` | Working dir (default `process.cwd()`) |
| `sandboxMode` | `'read-only'` (default) \| `'workspace-write'` \| `'danger-full-access'` |
| `approvalPolicy` | Default `'never'` — anything else can stall headless turns |
| `modelReasoningEffort` | `'minimal'` \| `'low'` \| `'medium'` \| `'high'` \| `'xhigh'` |
| `skipGitRepoCheck` | Default `true` |
| `networkAccessEnabled` | Network inside `workspace-write` sandbox |
| `webSearchMode` | `'disabled'` \| `'cached'` \| `'live'` |
| `additionalDirectories` | Extra writable dirs |
| `apiKey` | OpenAI key for subprocess |
| `baseUrl` | Override Codex backend URL |
| `codexPathOverride` | Specific codex binary |
| `env` | Subprocess env — when set, `process.env` is **not** inherited |
| `config` | Extra `--config key=value` (e.g. `mcp_servers`) |

Per-call: `sessionId`, `sandboxMode`, `approvalPolicy`, `modelReasoningEffort`, `workingDirectory`, `skipGitRepoCheck` via `modelOptions`.

## Stateful sessions

1. Capture `codex.session-id` CUSTOM event.
2. Pass `modelOptions.sessionId`.
3. Send only the latest user message.

**Server:**

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

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

  // harness tools stream as tool-call parts with results
}
```

Sessions under `~/.codex/sessions/` — same server instance only.

## Tools

1. **Harness tools** — `command_execution`, `file_change`, `web_search`, `todo_list` (results attached).
2. **Your tools** — short-lived Streamable-HTTP MCP on `127.0.0.1` for the turn.

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

**No client-side or `needsApproval` tools** — fails fast.

## Structured output

`structuredOutput()` uses native `outputSchema` in a fresh read-only thread. Prefer `@tanstack/ai-openai` for primary extraction work.

## Notes

- No token-level text streaming (message-at-a-time); tool activity still streams live
- Server-only (Node)
- Harness owns the agent loop
- No sampling controls
- Sessions machine-local
- Higher cold-start latency
