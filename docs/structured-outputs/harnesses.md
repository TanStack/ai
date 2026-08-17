---
title: Harness Structured Output
id: structured-outputs-harnesses
order: 6
description: "Ask a coding agent in a sandbox to inspect a repo, then read a typed object from chat({ outputSchema }). Works with Claude Code, Codex, OpenCode, and Grok Build."
keywords:
  - tanstack ai
  - structured outputs
  - harness
  - claude code
  - codex
  - opencode
  - grok build
  - outputSchema
  - sandbox
---

You asked a coding agent to inspect a repository. The agent streams tool calls and prose. You need a typed object you can store or render, not a wall of text to parse.

Pass `outputSchema` on the same `chat()` call. The harness runs its native tools. Then you get a validated object from `await chat()` or from `useChat().final`.

This page is for dedicated harness adapters:

- [Claude Code](../adapters/claude-code)
- [Codex](../adapters/codex)
- [OpenCode](../adapters/opencode)
- [Grok Build](../adapters/grok-build)

If you only extract JSON from a prompt and you do not need a sandbox, use [One-Shot Extraction](./one-shot) with an HTTP adapter.

## Define the schema

```typescript
import { z } from "zod";

export const ReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  mainPackages: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
    }),
  ),
  howToRun: z.string(),
});
```

The return type follows from the schema. You do not need a cast.

## Server: sandbox plus outputSchema

The harness needs a sandbox. Pass `withSandbox(...)`. If the client reads the stream, pass `stream: true`. Without `stream: true`, `chat()` returns a `Promise`, not SSE.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";
import { ReportSchema } from "./report-schema";

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "TanStack/ai" }),
  }),
});

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const messages =
    typeof body === "object" &&
    body !== null &&
    "messages" in body &&
    Array.isArray(body.messages)
      ? body.messages
      : [];

  const stream = chat({
    adapter: claudeCodeText("claude-opus-4-8"),
    messages,
    outputSchema: ReportSchema,
    stream: true,
    middleware: [withSandbox(sandbox)],
  });

  return toServerSentEventsResponse(stream);
}
```

Swap the adapter to change the agent:

- `codexText("gpt-5.3-codex")`
- `opencodeText("anthropic/claude-opus-4-5")`
- `grokBuildText("grok-build")`

The typed object arrives as a `structured-output.complete` event. Tool activity streams first.

## Client: read `final`

Pass the same schema to `useChat`. Read the object from `final`.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { ReportSchema } from "./report-schema";

function RepoReport() {
  const { sendMessage, isLoading, final } = useChat({
    connection: fetchServerSentEvents("/api/repo-report"),
    outputSchema: ReportSchema,
  });

  return (
    <>
      <button
        disabled={isLoading}
        onClick={() => sendMessage("What is this repository about?")}
      >
        Run report
      </button>
      {isLoading && <p>The agent is inspecting the repo.</p>}
      {final && (
        <>
          <h2>{final.name}</h2>
          <p>{final.oneLiner}</p>
          <p>{final.audience}</p>
        </>
      )}
    </>
  );
}
```

`final` is typed as the schema. It stays `null` until `structured-output.complete` arrives.

`partial` stays empty on harness adapters. The object is not streamed field by field. Render tool calls from `messages` while you wait. See [Streaming UIs](./streaming) for the `partial` / `final` shape.

## How each harness applies the schema

| Adapter | How the schema is applied |
|---|---|
| Claude Code | Native `--json-schema` flag on the same turn. The value is inline JSON, not a file path. |
| Codex | Native `--output-schema` flag on the same turn |
| OpenCode | Schema is added to the prompt. The adapter parses the last assistant text. |
| Grok Build | Schema is added to the prompt. The adapter parses the last assistant text. |

OpenCode and Grok Build parse JSON from the last assistant message. That parse fails if the message is not JSON. If the job is extract-only and you do not need a sandbox, use `@tanstack/ai-openai` or `@tanstack/ai-grok`.

The generic ACP adapter (`acpCompatible`) does not accept `outputSchema`. Use a dedicated harness adapter.

## Approval gates and client tools

Harness adapters run tools inside the sandbox. They do not pause for a browser round-trip.

- A tool without a server `execute()` fails fast.
- A tool with `needsApproval` fails fast.

If you need approval gates or client tools, use [With Tools](./with-tools) with an HTTP adapter.

## Script without a UI

If you do not stream to a browser, omit `stream: true`. The promise resolves with the typed object.

```typescript
import { chat } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import { withSandbox } from "@tanstack/ai-sandbox";
import { ReportSchema } from "./report-schema";
import { sandbox } from "./sandbox";

const report = await chat({
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "What is this repository about?" }],
  outputSchema: ReportSchema,
  middleware: [withSandbox(sandbox)],
});

report.name;
report.oneLiner;
```

## Try it

The React chat example includes a repo-report page.

1. Open [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat).
2. Set the harness API key in `.env`.
3. Open `/repo-report`.
4. Pick Claude Code, Grok Build, or Codex.
5. Run the report. The page reads the typed object from `useChat().final`.

The page clones `TanStack/ai` into a sandbox, asks the agent to inspect it, and shows the validated report.

Claude Code does not need you to accept a trust dialog for that clone. The adapter loads only user settings, so the clone's `.claude/settings.json` does not block headless `-p`.
