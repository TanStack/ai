---
title: Codex
id: codex-adapter
order: 12
description: "Run OpenAI's Codex agent inside a sandbox from TanStack AI. It runs shell commands and edits files in a real repo, and streams each step to your UI."
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

The Codex adapter runs the `codex` CLI in a sandbox and streams each step to `chat()`. The agent runs shell commands and edits files in a repo.

You need:

- A sandbox provider. The samples use Docker, so Docker must run on your machine.
- A `CODEX_API_KEY`, or a `codex login` on the machine.
- The `codex` CLI inside the sandbox. A setup step in the sandbox installs it.

Do you only want a GPT chat, with no repo and no shell? Use the [OpenAI adapter](./openai).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai-codex @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

## 2. Set the API key

Put your OpenAI API key in the environment of your server, with the name `CODEX_API_KEY`:

```bash
CODEX_API_KEY=sk-...
```

The sandbox in step 3 gives this key to the `codex` process as a workspace secret. `codex exec` signs in with `CODEX_API_KEY`. A bare `OPENAI_API_KEY` is not enough.

Did the machine already run `codex login`? Then you can use that login and no key. See [Harness Auth](../sandbox/auth).

## 3. Run the agent from the server

Define the sandbox once. It clones your repo into a Docker container and installs the `codex` CLI:

```ts
// sandbox.ts
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";

export const sandbox = defineSandbox({
  id: "codex-agent",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "owner/app" }),
    setup: ["npm install -g @openai/codex --include=optional && codex --version"],
    secrets: createSecrets({
      CODEX_API_KEY: process.env.CODEX_API_KEY ?? "",
    }),
  }),
});
```

Then pass the adapter and the sandbox to `chat()` in your route:

```ts
// api/agent.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: codexText("gpt-5.3-codex"),
    messages,
    threadId,
    runId,
    middleware: [withSandbox(sandbox)],
  });

  return toServerSentEventsResponse(stream);
}
```

Replace `owner/app` with your repo.

## 4. Render the agent's work

The client is the same as for any chat. Render the text, and show each tool that the agent ran:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function CodingAgent() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/agent"),
    threadId: "support-chat",
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) =>
        message.parts.map((part, index) => {
          if (part.type === "text") {
            return <p key={`${message.id}-${index}`}>{part.content}</p>;
          }
          if (part.type === "tool-call") {
            return <code key={part.id}>{part.name}</code>;
          }
          return null;
        }),
      )}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

Ask it "Fix the failing test in utils.test.ts". You see the agent's text, plus a line for each tool it used: `command_execution`, `file_change`, and more. The agent edited the files inside the container.

## How it works

- `codexText` declares that it needs a sandbox. `withSandbox(sandbox)` gives it one. Without a sandbox, `chat()` fails at the call site.
- Each `chat()` call runs one full agent turn. Codex runs its own loop and its own tools.
- The tools of the agent stream back as `tool-call` parts with the results attached. Your code does not run them.
- Codex also has its own inner sandbox. `sandboxMode` sets it. The outer TanStack sandbox is the real boundary.

To learn more about sandboxes, see [Sandboxes](../sandbox/overview).

## Resume a session

Codex keeps its working context between turns: the files it read, the commands it ran, and what it found. The adapter sends the thread id of each new run as a custom event named `codex.session-id`. Send it back in `modelOptions.sessionId` to continue the thread.

On the server, read the id from the request:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // The client sends the id in `forwardedProps`.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: codexText("gpt-5.3-codex"),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    middleware: [withSandbox(sandbox)],
    modelOptions: { sessionId },
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, keep the id from the custom event and pass it to `forwardedProps`. `useChat` sends the latest value with each request:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function useCodingAgent() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  return useChat({
    connection: fetchServerSentEvents("/api/agent"),
    forwardedProps: { sessionId },
    threadId: "support-chat",
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
}
```

- On a resumed thread, the adapter sends only the latest user message. The agent already has the rest.
- Codex saves the thread inside the sandbox. Resume works only when the next call runs in the same sandbox. See [Lifecycle & Snapshots](../sandbox/lifecycle).

## Give the agent your own tools

The agent has its own tools for files and the shell. It cannot reach your database or your secrets. Pass your server tools to `chat()`, and the adapter bridges them into the sandbox:

```ts group=tools
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

const lookupTicket = toolDefinition({
  name: "lookup_ticket",
  description: "Look up an issue ticket by id",
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => {
  return { ticketId, status: "open", title: "Crash on startup" };
});

const stream = chat({
  adapter: codexText("gpt-5.3-codex"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  threadId: "thread-1",
  tools: [lookupTicket],
  middleware: [withSandbox(sandbox)],
});
```

- Each tool runs on your server, with its closures and secrets. The result goes back into the sandbox.
- The tool-call events use the names you gave.
- Only server tools work here. A client tool has no server `execute()`, so the agent cannot run it.

For how the bridge reaches your server from each provider, see [Sandbox Tools](../sandbox/tools).

## Tool choice

You want Codex to skip your tools, or to see only one of them. Pass `toolChoice` to `chat()`:

```ts group=tools
const noBridgedTools = chat({
  adapter: codexText("gpt-5.3-codex"),
  messages: [{ role: "user", content: "Explain the bug in src/app.ts." }],
  threadId: "thread-1",
  tools: [lookupTicket],
  toolChoice: "none",
  middleware: [withSandbox(sandbox)],
});
```

`toolChoice` limits only the tools that the adapter bridges into Codex. The built-in Codex tools always stay on, and Codex decides when it calls a tool.

| Value | What the adapter does |
| --- | --- |
| `'auto'` | Bridges all of your tools. |
| `'none'` | Bridges none of your tools. |
| `{ type: 'tool', name }` | Bridges only the named tool. Codex does not have to call it. |
| `'required'` | Bridges all of your tools. Codex does not have to call one. |

Each value except `'auto'` logs a warning the first time an adapter instance gets it.

For the values on other adapters, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Structured output

You want a typed report after the agent reads the repo. Pass `outputSchema` on the same `chat()` call:

```ts
import { chat } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { withSandbox } from "@tanstack/ai-sandbox";
import { z } from "zod";
import { sandbox } from "./sandbox";

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
});

const report = await chat({
  adapter: codexText("gpt-5.3-codex"),
  messages: [{ role: "user", content: "Review this repo." }],
  threadId: "thread-1",
  outputSchema: Report,
  middleware: [withSandbox(sandbox)],
});

console.log(report.summary);
```

On the client, pass the same schema to `useChat` and read `final`. `partial` stays empty until the end.

```tsx
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { z } from "zod";

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
});

export function ReportView() {
  const { final, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/repo-report"),
    threadId: "support-chat",
    outputSchema: Report,
  });

  if (isLoading) return <p>The agent is inspecting the repo.</p>;
  if (!final) return null;
  return <p>{final.summary}</p>;
}
```

- Codex runs one turn and limits its last message with `--output-schema`.
- Tool activity and text stream as Codex writes them.
- The adapter parses the last message as the schema object. It arrives as `structured-output.complete`.

Do you only need JSON from a prompt, with no repo? Use `@tanstack/ai-openai`. That is faster. For the full walkthrough, see [Harness Agents](../structured-outputs/harnesses).

## Models and options

### Models

| Model | Reasoning levels |
| --- | --- |
| `gpt-5.3-codex` | `off`, `low`, `medium`, `high`, `xhigh` |
| `gpt-5.2-codex` | `low`, `medium`, `high`, `xhigh` |
| `gpt-5.1-codex`, `gpt-5.1-codex-mini` | `low`, `medium`, `high` |
| `gpt-5.1` | `off`, `low`, `medium`, `high` |

The package exports this list as `CODEX_MODELS`. The adapter also takes any other model id that Codex accepts, as a string.

### Reasoning

Set `reasoning` on `chat()`. Codex gets it as `model_reasoning_effort`:

```ts
import { chat } from "@tanstack/ai";
import { codexText } from "@tanstack/ai-codex";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

const stream = chat({
  adapter: codexText("gpt-5.3-codex"),
  messages: [{ role: "user", content: "Fix the failing test in utils.test.ts" }],
  threadId: "thread-1",
  reasoning: "xhigh",
  middleware: [withSandbox(sandbox)],
});
```

A call with no `reasoning` uses `modelReasoningEffort` from the adapter options. See [Reasoning](../chat/reasoning).

### Adapter options

Pass these as the second argument of `codexText`:

| Option | What it does |
| --- | --- |
| `cwd` | The working directory inside the sandbox. Default `/workspace`. |
| `sandboxMode` | The inner Codex sandbox: `'read-only'`, `'workspace-write'`, or `'danger-full-access'`. See [Inner sandbox mode](#inner-sandbox-mode). |
| `approvalPolicy` | `'never'` (default), `'on-failure'`, `'on-request'`, or `'untrusted'`. A headless run has no approval UI, so another value can stop a turn. |
| `modelReasoningEffort` | The effort when a call sets no `reasoning`: `'minimal'`, `'low'`, `'medium'`, or `'high'`. |
| `skipGitRepoCheck` | Skip the git repo check of Codex. Default `true`. |
| `networkAccessEnabled` | Allow network access inside the `workspace-write` sandbox. |
| `webSearchMode` | `'disabled'` or `'live'`. |
| `additionalDirectories` | More writable directories next to `cwd`. |
| `authMode` | `'api-key'` (default) expects `CODEX_API_KEY`. `'host'` uses `codex login`. See [Harness Auth](../sandbox/auth). |
| `codexExecutable` | The path or name of the `codex` executable in the sandbox. Default `codex`. |
| `env` | More environment variables for the `codex` process. |
| `config` | More `--config key=value` overrides for the Codex CLI, for example more `mcp_servers` entries. Values go through as TOML. |

### Per-call options

Pass these in `modelOptions` on `chat()`. They override the adapter options for one call:

- `sessionId`: resume a thread. See [Resume a session](#resume-a-session).
- `sandboxMode`, `approvalPolicy`, `skipGitRepoCheck`.
- `workingDirectory`: the working directory for this call.
- `authMode`: `'host'` or `'api-key'`.

## Advanced

### Inner sandbox mode

The default `sandboxMode` depends on the provider:

- Local-process and Docker: `'workspace-write'`.
- Daytona and Cloudflare: `'danger-full-access'`. These providers cannot create a nested bubblewrap namespace. The outer VM and your sandbox [Policy](../sandbox/policy) are then the isolation.

The inner Codex sandbox does not work on Windows and on some Linux images. There it fails with `os error 2`. If you see this error, set `sandboxMode: 'danger-full-access'`. The outer sandbox is still the boundary.

### Text streaming

Codex reports text as items that grow. The adapter streams each new piece of an item, so text can arrive in larger pieces than with an HTTP adapter. Tool activity, such as a command that starts or ends, streams live.

### Limitations

- **A sandbox is required.** Every call needs `withSandbox(...)`.
- **The agent owns the loop.** TanStack agent-loop strategies and per-iteration middleware do not apply inside a turn.
- **No sampling options.** Options such as `temperature` do not exist here.
- **Sessions stay in the sandbox.** Resume needs the same sandbox.
- **Cold starts.** Each call starts a CLI turn, so the first token arrives later than with an HTTP adapter.
- **No `wrapFetch`.** This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the `codex` process sends the model requests.

### Example apps

- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare): a TanStack Start app on Workers. You pick Claude Code, Codex, or Grok Build in the UI. It shows session resume, the tool timeline, and tool bridging.
- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web): Claude Code on Docker, with durable runs that continue after a page refresh. To use Codex there, change the adapter in `src/sandbox-agent.ts`.
