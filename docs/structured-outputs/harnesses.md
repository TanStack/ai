---
title: Harness Structured Output
id: structured-outputs-harnesses
order: 6
description: "Let a coding agent inspect a repo in a sandbox, then read a typed object from chat({ outputSchema }). Works with Claude Code, Codex, OpenCode, Grok Build, and acpCompatible."
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

You asked a coding agent to inspect a repository. It streams tool calls and prose, but you need a typed object that you can store or render.

Pass `outputSchema` on the same `chat()` call. The agent runs its native tools in the sandbox. Then you get a validated object from `await chat()` or from `useChat().final`.

This page is for the sandbox harness adapters:

- [Claude Code](../adapters/claude-code)
- [Codex](../adapters/codex)
- [OpenCode](../adapters/opencode)
- [Grok Build](../adapters/grok-build)
- [ACP-Compatible](../adapters/acp-compatible) (`acpCompatible`)

To extract JSON from a prompt with no sandbox, use [One-Shot Extraction](./one-shot) with an HTTP adapter.

## Quick setup

This setup assumes you have a sandbox provider ready. See [Sandbox Quick Start](../sandbox/quick-start).

### 1. Define the schema

```typescript
// schemas/report.ts
import { z } from "zod";

export const ReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  mainPackages: z.array(z.object({ name: z.string(), role: z.string() })),
  howToRun: z.string(),
});
```

### 2. Add the server endpoint

Add `withSandbox(...)` to the middleware. Pass `stream: true` so the client gets a stream:

```typescript
// api/repo-report.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";
import { ReportSchema } from "../schemas/report";

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "TanStack/ai" }),
  }),
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: claudeCodeText("claude-opus-4-8"),
    messages,
    threadId,
    runId,
    outputSchema: ReportSchema,
    stream: true,
    middleware: [withSandbox(sandbox)],
  });

  return toServerSentEventsResponse(stream);
}
```

### 3. Read the report on the client

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

// The same schema as schemas/report.ts. In your app, import it from that file.
const ReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  mainPackages: z.array(z.object({ name: z.string(), role: z.string() })),
  howToRun: z.string(),
});

export function RepoReport() {
  const { messages, sendMessage, isLoading, final } = useChat({
    connection: fetchServerSentEvents("/api/repo-report"),
    outputSchema: ReportSchema,
  });

  return (
    <>
      <button
        disabled={isLoading}
        onClick={() => void sendMessage("What is this repository about?")}
      >
        Run report
      </button>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === "thinking") {
              return <p key={index}>{part.content}</p>;
            }
            if (part.type === "tool-call") {
              return (
                <p key={part.id}>
                  {part.name} ({part.state})
                </p>
              );
            }
            if (part.type === "text") {
              return <p key={index}>{part.content}</p>;
            }
            return null;
          })}
        </div>
      ))}
      {final && (
        <section>
          <h2>{final.name}</h2>
          <p>{final.oneLiner}</p>
        </section>
      )}
    </>
  );
}
```

Click Run report. Tool calls such as `Read` and `Bash` appear first. When the agent finishes, the report shows the name and the one-line summary of the repo.

## How it works

1. `withSandbox` starts the sandbox and clones the repo.
2. The agent runs its native tools inside the sandbox. Each call streams to the client as a `tool-call` part.
3. The adapter applies your schema on the same turn. See [How each harness applies the schema](#how-each-harness-applies-the-schema).
4. The object arrives as a `structured-output.complete` event. `useChat` sets `final`.

`partial` stays empty on harness adapters, because the object does not stream field by field. Show the tool calls while you wait.

To change the agent, swap the adapter:

- `codexText("gpt-5.3-codex")`
- `opencodeText("anthropic/claude-opus-4-5")`
- `grokBuildText("composer-2.5")`
- `acpCompatibleText(...)` for any ACP CLI. See [ACP-Compatible](../adapters/acp-compatible).

## Script without a UI

If you do not stream to a browser, leave out `stream: true`. Then the promise resolves with the typed object:

```typescript
import { chat } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";
import { ReportSchema } from "./schemas/report";

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "TanStack/ai" }),
  }),
});

const report = await chat({
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "What is this repository about?" }],
  outputSchema: ReportSchema,
  middleware: [withSandbox(sandbox)],
});

console.log(report.name, report.oneLiner);
```

## Try it in the example app

The React chat example has a repo-report page.

1. Open [`examples/ts-react-chat`](https://github.com/TanStack/ai/tree/main/examples/ts-react-chat).
2. Open `/repo-report`.
3. Pick Claude Code, Grok Build, ACP compatible, or Codex.
4. Pick Auth. The default is **API key**. If the machine already ran `claude login`, `grok login`, or `codex login`, use **Host login**.
5. Run the report.

The page clones `TanStack/ai` into a sandbox, asks the agent to inspect it, and shows the validated report. It renders tool calls and reasoning from `messages[].parts`, and reads the object from the `structured-output` part and from `final`.

## Advanced

### Parts on the message

The assistant message holds the live run:

- `thinking`: reasoning from the harness, when the agent emits it.
- `tool-call`: native harness tools, such as `Read` or `Bash`.
- `text`: prose that the agent writes before the JSON.
- `structured-output`: the schema object. `part.data` is the validated value, and `part.raw` is the source string. `part.partial` is a progressive parse, when the adapter streams JSON text.

`final` has the type of your schema. It stays `null` until `structured-output.complete` arrives, and it always matches the latest assistant turn. Older turns keep their own `structured-output` parts. For the `partial` and `final` shape, see [Streaming UIs](./streaming).

### How each harness applies the schema

| Adapter | How the schema is applied |
| --- | --- |
| Claude Code | Native `--json-schema` flag on the same turn. The value is inline JSON, not a file path. |
| Codex | Native `--output-schema` flag on the same turn. Assistant text streams while Codex writes it. The last message is also the schema object. |
| OpenCode | The schema goes into the prompt. The adapter parses the last assistant text. |
| Grok Build | The schema goes into the prompt. The adapter parses the last assistant text. |
| ACP compatible | The schema goes into the prompt. The adapter parses the last assistant text. |

OpenCode, Grok Build, and `acpCompatible` parse JSON from the last assistant message. If that message is not JSON, the parse fails. If the job is only extraction and you do not need a sandbox, use `@tanstack/ai-openai` or `@tanstack/ai-grok`.

### Approval gates and client tools

Harness adapters run tools inside the sandbox. They do not pause for a round trip to the browser:

- A tool with no server `execute()` fails fast.
- A tool with `needsApproval` fails fast.

For approval gates or client tools, use [With Tools](./with-tools) with an HTTP adapter.

### Persist the typed object

Add `withPersistence` next to `withSandbox`. The engine stores the complete structured-output part on the transcript. A reload rebuilds that transcript through `reconstructChat`. See [Chat Persistence](../persistence/chat-persistence).

The message id decides how the parts are stored:

- A new message id keeps the harness prose and the structured object as two assistant messages.
- The id of the last text message keeps both on one message.

```typescript
// api/repo-report.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import { withPersistence } from "@tanstack/ai-persistence";
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";
import { persistence } from "../persistence";
import { ReportSchema } from "../schemas/report";

const sandbox = defineSandbox({
  id: "repo-report",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "TanStack/ai" }),
  }),
});

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: claudeCodeText("claude-opus-4-8"),
    messages,
    threadId,
    runId,
    outputSchema: ReportSchema,
    stream: true,
    middleware: [withSandbox(sandbox), withPersistence(persistence)],
  });

  return toServerSentEventsResponse(stream);
}
```

### Claude Code and the trust dialog

Claude Code does not ask you to accept a trust dialog for the cloned repo. The adapter loads only user settings, so the `.claude/settings.json` of the clone does not block headless `-p`. Host login uses your host `claude login`. The sandbox type does not decide this. See [Harness Auth](../sandbox/auth).
