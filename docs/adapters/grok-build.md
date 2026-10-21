---
title: Grok Build
id: grok-build-adapter
order: 15
description: "Run xAI's Grok Build coding agent inside a sandbox from TanStack AI. It edits files and runs commands in a real repo and streams each step to your UI."
keywords:
  - tanstack ai
  - grok
  - grok build
  - xai
  - harness
  - agent
  - coding agent
  - adapter
---

The Grok Build adapter gives `chat()` xAI's coding agent. It runs the `grok` CLI inside a sandbox, where the agent edits files, runs commands, and searches a real repo. Each step streams back to your UI.

You need:

- A sandbox provider. The samples use Docker, so Docker must run on your machine.
- An `XAI_API_KEY`, or a `grok login` on the machine.
- The `grok` CLI inside the sandbox. A setup step in the sandbox installs it.

Do you only want a Grok chat, with no repo and no shell? Use the [Grok adapter](./grok).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
XAI_API_KEY=xai-...
```

The sandbox in step 3 gives this key to the `grok` process as a workspace secret.

Did the machine already run `grok login`? Then you can use that login and no key. See [Harness Auth](../sandbox/auth).

## 3. Run the agent from the server

Define the sandbox once. It clones your repo into a Docker container and installs the `grok` CLI with `GROK_CLI_INSTALL_COMMAND`:

```ts
// sandbox.ts
import { GROK_CLI_INSTALL_COMMAND } from "@tanstack/ai-grok-build";
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";

export const sandbox = defineSandbox({
  id: "grok-build-agent",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "owner/app" }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? "",
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
import { grokBuildText } from "@tanstack/ai-grok-build";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: grokBuildText("grok-build"),
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

Ask it "Fix the failing test in utils.test.ts". You see the agent's text, plus a line for each tool it used. The agent edited the files inside the container.

For a version of this setup that runs as a script and prints the diff, see the [Sandbox Quick Start](../sandbox/quick-start).

## How it works

- `grokBuildText` declares that it needs a sandbox. `withSandbox(sandbox)` gives it one. Without a sandbox, `chat()` fails at the call site.
- Each `chat()` call runs one full agent turn. Grok Build runs its own loop and its own tools.
- The tools of the agent stream back as `tool-call` parts with the results attached. Your code does not run them.
- By default, the adapter talks to `grok` over the Agent Client Protocol (ACP).
- When the run ends, the adapter sends a `file.changed` custom event with the `git diff` of the workspace.

To learn more about sandboxes, see [Sandboxes](../sandbox/overview).

## Resume a session

Grok Build keeps its working context between turns: the files it read, the commands it ran, and what it found. The adapter sends the session id of each new run as a custom event named `grok-build.session-id`. Send it back in `modelOptions.sessionId` to continue the session.

On the server, read the id from the request:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { grokBuildText } from "@tanstack/ai-grok-build";
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
    adapter: grokBuildText("grok-build"),
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
    onCustomEvent: (name, value) => {
      if (
        name === "grok-build.session-id" &&
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

On a resumed session, the adapter sends only the latest user message. The agent already has the rest.

## Give the agent your own tools

The agent has its own tools for files and the shell. It cannot reach your database or your secrets. Pass your server tools to `chat()`, and the adapter bridges them into the sandbox over an MCP tool proxy that checks a token:

```ts group=tools
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { grokBuildText } from "@tanstack/ai-grok-build";
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
  adapter: grokBuildText("grok-build"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
  middleware: [withSandbox(sandbox)],
});
```

- Each tool runs on your server, with its closures and secrets. The result goes back into the sandbox.
- The tool-call events use the names you gave.
- Only server tools work here. A client tool has no server `execute()`, so the agent cannot run it.

For how the bridge reaches your server from each provider (local, Docker, or cloud), see [Sandbox Tools](../sandbox/tools).

## Tool choice

You want Grok Build to see only one of your tools, or none of them. Pass `toolChoice` to `chat()`:

```ts group=tools
const onlyLookup = chat({
  adapter: grokBuildText("grok-build"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  tools: [lookupTicket],
  toolChoice: { type: "tool", name: "lookup_ticket" },
  middleware: [withSandbox(sandbox)],
});
```

`toolChoice` limits only the tools that the adapter bridges into Grok Build. The built-in Grok Build tools always stay on, and Grok Build decides when it calls a tool. The rules are the same on both protocols.

| Value | What the adapter does |
| --- | --- |
| `'auto'` | Bridges all of your tools. |
| `'none'` | Bridges none of your tools. |
| `{ type: 'tool', name }` | Bridges only the named tool. Grok Build does not have to call it. |
| `'required'` | Bridges all of your tools. Grok Build does not have to call one. |

Each value except `'auto'` logs a warning the first time an adapter instance gets it.

For the values on other adapters, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Structured output

You want a typed report after the agent reads the repo. Pass `outputSchema` on the same `chat()` call:

```ts
import { chat } from "@tanstack/ai";
import { grokBuildText } from "@tanstack/ai-grok-build";
import { withSandbox } from "@tanstack/ai-sandbox";
import { z } from "zod";
import { sandbox } from "./sandbox";

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
});

const report = await chat({
  adapter: grokBuildText("grok-build"),
  messages: [{ role: "user", content: "Review this repo." }],
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
    outputSchema: Report,
  });

  if (isLoading) return <p>The agent is inspecting the repo.</p>;
  if (!final) return null;
  return <p>{final.summary}</p>;
}
```

- Grok Build has no schema flag. The adapter adds the JSON Schema to the prompt, on both protocols.
- The adapter parses the last assistant text. Tool activity still streams.
- The object arrives as `structured-output.complete`.

Do you only need JSON from a prompt, with no repo? Use `@tanstack/ai-grok`. For the full walkthrough, see [Harness Agents](../structured-outputs/harnesses).

## Models and options

### Models

| Model id | Notes |
| --- | --- |
| `grok-build` | The short alias. With a grok.com browser login, the CLI lists the model under this name. |
| `grok-build-0.1` | The full id. The CLI lists the model under this name when it signs in with `XAI_API_KEY`. |
| `composer-2.5` | Also runs through the Grok Build harness. |

The adapter changes `grok-build` to `grok-build-0.1` for the CLI, so the same code works with both ways to sign in. The package exports the list as `GROK_BUILD_MODELS`. The adapter also takes any other xAI model id as a string.

### Adapter options

Pass these as the second argument of `grokBuildText`:

| Option | What it does |
| --- | --- |
| `cwd` | The working directory inside the sandbox. Default `/workspace`. |
| `authMode` | `'api-key'` (default) signs in with `XAI_API_KEY`. `'host'` uses `grok login`. See [Harness Auth](../sandbox/auth). |
| `authMethodId` | An explicit ACP auth method. It wins over `authMode`. |
| `protocol` | `'acp'` (default) or `'streaming-json'`. See [Protocols and durable runs](#protocols-and-durable-runs). |
| `transport` | The ACP transport: `'auto'` (default), `'stdio'`, or `'websocket'`. |
| `acpPort` | The port of `grok agent serve` in the sandbox, for the WebSocket transport. |
| `permissionMode` | The ACP permission policy: `'default'`, `'acceptEdits'`, or `'bypassPermissions'` (default). |
| `emitDiff` | Send the `file.changed` event with the `git diff` after the run. Default `true`. |
| `grokExecutable` | The path or name of the `grok` executable in the sandbox. Default `grok`. |
| `env` | More environment variables for the `grok` process. |
| `extraArgs` | More raw CLI flags. The adapter adds them as they are. |

### Per-call options

Pass these in `modelOptions` on `chat()`. They override the adapter options for one call:

- `sessionId`: resume a session. See [Resume a session](#resume-a-session).
- `maxTurns`: the maximum number of agent turns for this call.
- `cwd`, `protocol`, `transport`, `acpPort`, `permissionMode`.
- `authMode` and `authMethodId`.

## Advanced

### Protocols and durable runs

The adapter talks to `grok` over one of two protocols:

- `'acp'` (default): the Agent Client Protocol.
- `'streaming-json'`: the headless NDJSON output of the CLI.

A durable sandbox run (you pass `runs` and `durability` to `withSandbox`) writes the agent output to a journal, so a later request can take the run over. ACP does not write a journal. So when durability is wired and you do not set `protocol`, the adapter uses `'streaming-json'`.

Set `protocol: 'acp'` only when you want ACP on that call:

- A new ACP run with durability wired logs a warning.
- An attach to an ACP run throws `DurableAttachNotSupportedError`.

See [Durable Runs](../sandbox/durable-runs) and [The Run Journal](../sandbox/journal).

### Headless NDJSON flags

On the `'streaming-json'` path with auto-approve, the adapter adds `--always-approve --no-plan --no-auto-update`. These flags stop Plan Mode and the CLI update check from blocking a headless run.

### Limitations

- **A sandbox is required.** Every call needs `withSandbox(...)`.
- **The agent owns the loop.** TanStack agent-loop strategies and per-iteration middleware do not apply inside a turn.
- **No sampling options.** Options such as `temperature` do not exist here.
- **Cold starts.** Each call runs a full CLI turn, so the first token arrives later than with an HTTP adapter.
- **No `wrapFetch`.** This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the `grok` process sends the model requests.

For any other ACP agent, use the [ACP-Compatible Harness](./acp-compatible).
