---
title: OpenCode
id: opencode-adapter
order: 14
description: "OpenCode harness adapter — local agent loop, token streaming, sessions via @tanstack/ai-opencode."
keywords:
  - tanstack ai
  - opencode
  - opencode sdk
  - harness
  - agent
  - coding agent
  - adapter
---

If you need OpenCode as a chat backend → **server-only**: install CLI + package, auth providers, call `opencodeText("provider/model", { directory, permissionMode })`.

> Spawns or attaches to `opencode serve`. Never in the browser.

Demos: [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare), [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web).

## Install

```bash
npm install @tanstack/ai-opencode
npm install -g opencode-ai
opencode auth login
```

## Do this

Models: `provider/model` (split on first `/`).

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

| Option | Description |
| --- | --- |
| `directory` | Working dir (default `process.cwd()`) |
| `baseUrl` | Attach to existing `opencode serve` (e.g. `http://127.0.0.1:4096`) |
| `hostname` / `port` | Spawned server (defaults `127.0.0.1` / `4096`) |
| `permissionMode` | `'default'` \| `'acceptEdits'` \| `'bypassPermissions'` |
| `onPermissionRequest` | Custom permission handler |
| `config` | Extra OpenCode config (MCP, permissions) |

`modelOptions`: `sessionId`, `permissionMode`, `directory`.

## Permissions

Headless policy never hangs:

- **`default`** — bridged tools run; edits/shell/fetch that would prompt → rejected
- **`acceptEdits`** — also auto-approves file mutations
- **`bypassPermissions`** — allow all (sandbox/scratch only)

## Stateful sessions

1. Capture `opencode.session-id` CUSTOM event.
2. Pass `modelOptions.sessionId`.
3. Send only the latest user message.

**Server:**

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

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
}
```

Resume on same server (or shared `baseUrl`).

## Tools

1. **Harness tools** — `bash`, `edit`, `write`, `read`, `grep`; todo as `opencode.todo` CUSTOM.
2. **Your tools** — Streamable-HTTP MCP on `127.0.0.1` for the turn (`tanstack_` prefix stripped).

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

No client-side / `needsApproval` tools — fails fast.

## Structured output

Best-effort: schema in prompt, parse final text. Prefer a plain provider for primary extraction.

## Notes

- Server-only (Node)
- Harness owns agent loop; no sampling controls
- Sessions server-local
- Reduce cold start with long-lived `baseUrl`
