---
title: OpenCode
id: opencode-adapter
order: 14
description: "Run the OpenCode agent inside a sandbox from TanStack AI, with any model that OpenCode supports. It edits files and runs commands in a real repo and streams each step."
keywords:
  - tanstack ai
  - opencode
  - opencode sdk
  - harness
  - agent
  - coding agent
  - adapter
---

The OpenCode adapter starts `opencode serve` in a sandbox and streams text and tool steps to `chat()`. The agent edits files and runs commands in a repo.

You need:

- A sandbox provider. The samples use Docker, so Docker must run on your machine.
- An API key for the model provider that OpenCode uses. The samples use OpenAI, so they need `OPENAI_API_KEY`.
- The `opencode` CLI inside the sandbox. A setup step in the sandbox installs it.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai-opencode @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
OPENAI_API_KEY=sk-...
```

OpenCode reads the key from the environment of its process. The sandbox in step 3 passes it in as a workspace secret. This adapter has no `authMode` option.

## 3. Run the agent from the server

Define the sandbox once. It clones your repo into a Docker container and installs the `opencode` CLI:

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
  id: "opencode-agent",
  // The host talks to `opencode serve` on port 4096, so publish it.
  provider: dockerSandbox({ image: "node:22", publishPorts: [4096] }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "owner/app" }),
    setup: ["npm install -g opencode-ai --include=optional && opencode --version"],
    secrets: createSecrets({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
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
import { opencodeText } from "@tanstack/ai-opencode";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: opencodeText("openai/gpt-5.2", {
      permissionMode: "acceptEdits",
    }),
    messages,
    threadId,
    runId,
    middleware: [withSandbox(sandbox)],
  });

  return toServerSentEventsResponse(stream);
}
```

- Replace `owner/app` with your repo.
- Model ids are `provider/model`. The adapter splits the id at the first `/`.
- `permissionMode: "acceptEdits"` lets the agent edit files. See [Permissions](#permissions).

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

Ask it "Fix the failing test in utils.test.ts". The text streams token by token, and you see a line for each tool the agent used: `read`, `edit`, `bash`, and more. The agent edited the files inside the container.

## How it works

- `opencodeText` declares that it needs a sandbox. `withSandbox(sandbox)` gives it one. Without a sandbox, `chat()` fails at the call site.
- The adapter starts `opencode serve` inside the sandbox and connects to it over HTTP with the `@opencode-ai/sdk` client.
- Each `chat()` call runs one full agent turn. OpenCode runs its own loop and its own tools.
- Text and reasoning stream token by token. The tools of the agent stream back as `tool-call` parts with the results attached. Your code does not run them.
- The adapter holds each message part until it knows the role of the message. It streams assistant parts and skips user parts.
- OpenCode can send a tool part before the tool input is ready. The adapter waits for the next update, so each tool call streams with its arguments.
- The running todo plan of the agent arrives as an `opencode.todo` custom event.

To learn more about sandboxes, see [Sandboxes](../sandbox/overview).

## Permissions

OpenCode asks for permission before it edits files or runs commands. A headless server has no person to answer, so the adapter answers each request from `permissionMode`. A turn never waits for an answer.

| Mode | What runs |
| --- | --- |
| `'default'` | Your bridged tools run. Every other request that asks (edits, shell, web fetch) is rejected. |
| `'acceptEdits'` | Also allows file edits (edit, write, patch). |
| `'bypassPermissions'` | Allows every request. Use it only in a sandbox or a scratch directory. |

To write your own rules, for example to allow only some commands, pass `onPermissionRequest`. It replaces the default policy.

## Resume a session

OpenCode keeps its working context between turns: the files it read, the commands it ran, and what it found. The adapter sends the session id of each new run as a custom event named `opencode.session-id`. Send it back in `modelOptions.sessionId` to continue the session.

On the server, read the id from the request:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);

  // Extra fields the client puts in the connection `body` arrive here.
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: opencodeText("openai/gpt-5.2", { permissionMode: "acceptEdits" }),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    middleware: [withSandbox(sandbox)],
    modelOptions: { sessionId },
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, keep the id from the custom event and send it with each request:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function useCodingAgent() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  return useChat({
    connection: fetchServerSentEvents("/api/agent", () => ({
      body: { sessionId },
    })),
    threadId: "support-chat",
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

- On a resumed session, the adapter sends only the latest user message. The agent already has the rest.
- OpenCode saves the session inside the sandbox. Resume works only when the next call runs in the same sandbox. See [Lifecycle & Snapshots](../sandbox/lifecycle).

## Give the agent your own tools

The agent has its own tools for files and the shell. It cannot reach your database or your secrets. Pass your server tools to `chat()`, and the adapter bridges them into the sandbox:

```ts group=tools
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";
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
  adapter: opencodeText("openai/gpt-5.2"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  threadId: "thread-1",
  tools: [lookupTicket],
  middleware: [withSandbox(sandbox)],
});
```

- Each tool runs on your server, with its closures and secrets. The result goes back into the sandbox.
- OpenCode names the tool `tanstack_lookup_ticket` internally. The adapter removes the prefix, so the events use the name you gave.
- Your bridged tools always run, in every permission mode.
- Only server tools work here. A client tool has no server `execute()`, so the agent cannot run it.

For how the bridge reaches your server from each provider, see [Sandbox Tools](../sandbox/tools).

## Tool choice

You want OpenCode to see only one of your tools, or none of them. Pass `toolChoice` to `chat()`:

```ts group=tools
const onlyLookup = chat({
  adapter: opencodeText("openai/gpt-5.2"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  threadId: "thread-1",
  tools: [lookupTicket],
  toolChoice: { type: "tool", name: "lookup_ticket" },
  middleware: [withSandbox(sandbox)],
});
```

`toolChoice` limits only the tools that the adapter bridges into OpenCode. The built-in OpenCode tools (`bash`, `edit`, and the others) always stay on, and OpenCode decides when it calls a tool.

| Value | What the adapter does |
| --- | --- |
| `'auto'` | Bridges all of your tools. |
| `'none'` | Bridges none of your tools. |
| `{ type: 'tool', name }` | Bridges only the named tool. OpenCode does not have to call it. |
| `'required'` | Bridges all of your tools. OpenCode does not have to call one. |

Each value except `'auto'` logs a warning the first time an adapter instance gets it.

For the values on other adapters, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Structured output

You want a typed report after the agent reads the repo. Pass `outputSchema` on the same `chat()` call:

```ts
import { chat } from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";
import { withSandbox } from "@tanstack/ai-sandbox";
import { z } from "zod";
import { sandbox } from "./sandbox";

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
});

const report = await chat({
  adapter: opencodeText("openai/gpt-5.2"),
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

- OpenCode has no schema flag. The adapter adds the JSON Schema to the prompt.
- The adapter parses the last assistant text as JSON. It removes markdown fences first.
- Tool activity still streams. The object arrives as `structured-output.complete`.

Do you only need JSON from a prompt, with no repo? Use a model adapter such as `@tanstack/ai-openai`. For the full walkthrough, see [Harness Agents](../structured-outputs/harnesses).

## Models and options

### Models

| Model | Reasoning levels | What `reasoning` sets |
| --- | --- | --- |
| `anthropic/claude-opus-4-5` | `low`, `medium`, `high` | `thinking` with a token budget |
| `anthropic/claude-sonnet-4-5`, `opencode/claude-sonnet-4-5` | `off`, `minimal`, `low`, `medium`, `high` | `thinking` with a token budget |
| `openai/gpt-5.2` | `off`, `low`, `medium`, `high`, `xhigh` | `reasoningEffort` |
| `openai/gpt-5.1-codex`, `opencode/gpt-5.1-codex` | `low`, `medium`, `high` | `reasoningEffort` |
| `google/gemini-3-pro-preview` | none | none |

The package exports this list as `OPENCODE_MODELS`. The adapter also takes any other `provider/model` id that your OpenCode providers support.

### Reasoning

Set `reasoning` on `chat()`. The adapter writes it into the `options` of the model in the OpenCode server config:

```ts
import { chat } from "@tanstack/ai";
import { opencodeText } from "@tanstack/ai-opencode";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

const stream = chat({
  adapter: opencodeText("anthropic/claude-sonnet-4-5"),
  messages: [{ role: "user", content: "Refactor the auth module" }],
  threadId: "thread-1",
  reasoning: { level: "high", budgetTokens: 8000 },
  middleware: [withSandbox(sandbox)],
});
```

- Claude models get `thinking` with a token budget. `off` turns thinking off.
- The other models get `reasoningEffort`, plus `reasoningSummary: "auto"` when the summary is on.

See [Reasoning](../chat/reasoning).

### Adapter options

Pass these as the second argument of `opencodeText`:

| Option | What it does |
| --- | --- |
| `directory` | The working directory inside the sandbox. Default `/workspace`. |
| `port` | The port of `opencode serve` inside the sandbox. Default `4096`. On Docker, publish it with `publishPorts`. |
| `hostname` | The hostname that the server binds in the sandbox. Default `0.0.0.0`. |
| `permissionMode` | `'default'` (default), `'acceptEdits'`, or `'bypassPermissions'`. See [Permissions](#permissions). |
| `onPermissionRequest` | Your own permission handler. It replaces the default policy. |

### Per-call options

Pass these in `modelOptions` on `chat()`:

- `sessionId`: resume a session. See [Resume a session](#resume-a-session).
- `permissionMode`: the permission mode for this call.
- `directory`: the working directory for this call.

## Advanced

### Ports on other providers

The host connects to `opencode serve` over HTTP, so the sandbox must expose the port:

- Docker: pass `publishPorts: [4096]` to `dockerSandbox()`.
- Vercel: expose the port with the `ports` option of the provider.
- Local-process and Daytona: nothing to do.

### No run journal

OpenCode does not write NDJSON to stdout, so this adapter writes no run journal, also on a durable run. See [Harnesses](../sandbox/harnesses#harness-output-can-go-to-a-journal).

### Limitations

- **A sandbox is required.** Every call needs `withSandbox(...)`.
- **The agent owns the loop.** TanStack agent-loop strategies and per-iteration middleware do not apply inside a turn.
- **No sampling options.** Options such as `temperature` do not exist here.
- **Sessions stay in the sandbox.** Resume needs the same sandbox.
- **Cold starts.** Each call starts the OpenCode server in the sandbox and stops it after the turn. So the first token arrives later than with an HTTP adapter.
- **No `wrapFetch`.** This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the OpenCode server sends the model requests.

### Example apps

- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare): a coding agent at the edge, with session resume, the tool timeline, and tool bridging.
- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web): Claude Code on Docker, with durable runs that continue after a page refresh. To use OpenCode there, change the adapter in `src/sandbox-agent.ts`.
