---
title: ACP-Compatible Harness
id: acp-compatible-harness
description: "Run any coding agent that speaks the Agent Client Protocol (ACP) inside a TanStack AI sandbox, with one generic harness adapter and no dedicated package."
keywords:
  - tanstack ai
  - acp
  - agent client protocol
  - coding agent
  - harness
  - sandbox
  - custom adapter
---

Your coding agent speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), but it has no `@tanstack/ai-*` package. `acpCompatible` builds a `chat()` adapter for any ACP agent CLI. You tell it how to start the agent, and it runs the agent inside a sandbox.

It is the harness version of the [OpenAI-Compatible adapter](./openai-compatible). Does a dedicated harness adapter exist for your agent, such as [Grok Build](./grok-build)? Use that one. It knows the models and the special behavior of its agent.

You need:

- A sandbox provider. The samples use Docker, so Docker must run on your machine.
- An agent CLI that runs an ACP server over stdio, installed inside the sandbox. The samples use the `grok` CLI.
- The API key of that agent, or a CLI login on the machine.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
vue: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
solid: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
svelte: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
preact: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
angular: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
vanilla: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build
octane: @tanstack/ai @tanstack/ai-acp @tanstack/ai-sandbox @tanstack/ai-sandbox-docker @tanstack/ai-grok-build

<!-- ::end:tabs -->

The samples import `GROK_CLI_INSTALL_COMMAND` from `@tanstack/ai-grok-build`, to install the `grok` CLI in the sandbox. For another agent, use its own install command and skip that package.

## 2. Set the API key

Put the key of your agent in the environment of your server. For the `grok` CLI:

```bash
XAI_API_KEY=xai-...
```

The sandbox in step 3 gives this key to the agent as a workspace secret. Then the adapter signs in through ACP `authenticate`, with the auth method that you name in `authMethodId`. For Grok, it is `xai.api_key`.

Did the machine already log in to the agent CLI? Set `authMode: 'host'`. The adapter then skips ACP `authenticate`. See [Harness Auth](../sandbox/auth).

## 3. Run the agent from the server

Define the sandbox once. It clones your repo into a Docker container and installs the agent CLI:

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
  id: "acp-agent",
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

Then build the adapter with `acpCompatibleText` and pass it to `chat()`. `command` returns the shell command that starts the ACP server of the agent over stdio:

```ts
// api/agent.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { acpCompatibleText } from "@tanstack/ai-acp";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: acpCompatibleText("composer-2.5", {
      name: "acp",
      command: ({ model }) => `grok agent -m '${model}' --always-approve stdio`,
      authMethodId: "xai.api_key",
    }),
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

## How it works

`acpCompatible` gives you the full ACP flow:

- It finds the sandbox from `withSandbox(...)` and starts the agent there.
- It bridges your `chat()` tools into the agent over MCP.
- It handles session resume, permission requests, and abort.
- It turns the ACP updates of the agent into `chat()` stream chunks.

## Configure an agent once

For more than one model, configure the agent once with `acpCompatible`. You get a factory. Then pick the model on each call:

```ts
// pi-harness.ts
import { acpCompatible } from "@tanstack/ai-acp";

export const pi = acpCompatible({
  name: "pi",
  models: ["pi-fast", "pi-pro"],
  modelOptions: {} as { reasoningEffort?: "low" | "high" },
  command: ({ model, harnessCwd, modelOptions }) =>
    `pi --acp -m ${model} --cwd ${harnessCwd}` +
    (modelOptions?.reasoningEffort
      ? ` --effort ${modelOptions.reasoningEffort}`
      : ""),
  authMethodId: "pi-api-key",
  refusalMessage: "Pi refused the request.",
});
```

```ts
import { chat } from "@tanstack/ai";
import { withSandbox } from "@tanstack/ai-sandbox";
import { pi } from "./pi-harness";
import { sandbox } from "./sandbox";

const stream = chat({
  adapter: pi("pi-pro"),
  modelOptions: { reasoningEffort: "high" },
  messages: [{ role: "user", content: "Fix the failing test." }],
  middleware: [withSandbox(sandbox)],
});
```

- `models` makes the factory type-safe. `pi("pi-ultra")` is a type error. Without `models`, the factory takes any string.
- `modelOptions` is a type-only brand. The value `{} as { ... }` is not used at run time. It types what `chat({ modelOptions })` takes.
- Your declared options join the base options. `command` and `openTransport` get them as `ctx.modelOptions`, so you can turn them into CLI flags.
- The base options are always there: `sessionId`, `cwd`, `authMode`, `authMethodId`, and `permissionMode`.

## Permissions

Inside a sandbox, the sandbox is the security boundary. So by default, the adapter answers each permission request of the agent with `permissionMode: 'bypassPermissions'`. The agent edits files and runs commands with no prompt.

To send tool approvals to a client, switch to `'interactive'`:

```ts
import { acpCompatible } from "@tanstack/ai-acp";

export const pi = acpCompatible({
  name: "pi",
  command: ({ model }) => `pi --acp -m ${model}`,
  permissions: "interactive", // send approval-requested events for `ask` prompts
  permissionMode: "acceptEdits", // still allow file edits with no prompt
});
```

- With `'interactive'`, an `ask` prompt sends an approval-requested event. The client approves, then runs the turn again.
- Your `chat()` tools that the adapter bridges into the agent are always allowed, in every mode.
- To write your own rules, pass `onPermissionRequest`. It overrides `permissions` and `permissionMode`.

## Tool choice

You want the agent to see only one of your tools, or none of them. Pass `toolChoice` to `chat()`. It limits only the tools that the adapter bridges into the agent. ACP has no field to turn off the built-in tools of the agent or to force a tool call. So the agent decides when it calls a tool.

| Value | What the adapter does |
| --- | --- |
| `'auto'` | Bridges all of your tools. |
| `'none'` | Bridges none of your tools. |
| `{ type: 'tool', name }` | Bridges only the named tool. The agent does not have to call it. |
| `'required'` | Bridges all of your tools. The agent does not have to call one. |

Each value except `'auto'` logs a warning the first time an adapter instance gets it. The warning starts with the harness `name`, for example `pi:`.

For the values on other adapters, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Session resume

On each run, the adapter sends the session id of the agent as a custom event named `<name>.session-id`, for example `pi.session-id`. Send the id back in `modelOptions.sessionId` on the next call, and the agent continues the session:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { withSandbox } from "@tanstack/ai-sandbox";
import { pi } from "./pi-harness";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const sessionId =
    typeof params.forwardedProps.sessionId === "string"
      ? params.forwardedProps.sessionId
      : undefined;

  const stream = chat({
    adapter: pi("pi-fast"),
    messages: params.messages,
    middleware: [withSandbox(sandbox)],
    modelOptions: { sessionId },
  });

  return toServerSentEventsResponse(stream);
}
```

On a resumed session, the adapter sends only the last user message. The agent already has the rest. For the client half, see [Resume a session](./claude-code#resume-a-session) on the Claude Code page. Use your `<name>.session-id` as the event name.

## Typed output

You want a typed object after the agent works. Pass `outputSchema` on the same `chat()` call. The agent runs its own tools. Then the adapter adds the schema to the prompt and parses the last assistant text as JSON.

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { acpCompatibleText } from "@tanstack/ai-acp";
import { withSandbox } from "@tanstack/ai-sandbox";
import { z } from "zod";
import { sandbox } from "./sandbox";

const ReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
});

export async function POST(request: Request) {
  const { messages } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: acpCompatibleText("pi-fast", {
      name: "pi",
      command: ({ model }) => `pi --acp -m ${model}`,
    }),
    messages,
    outputSchema: ReportSchema,
    stream: true,
    middleware: [withSandbox(sandbox)],
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, walk `messages[].parts` for tool calls and reasoning. Read the typed object from the `structured-output` part or from `useChat().final`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

const ReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
});

export function Report() {
  const { messages, final } = useChat({
    connection: fetchServerSentEvents("/api/report"),
    outputSchema: ReportSchema,
  });

  return (
    <>
      {messages.map((message) =>
        message.parts.map((part, index) => {
          if (part.type === "tool-call") {
            return <p key={part.id}>{part.name}</p>;
          }
          if (part.type === "structured-output") {
            const report = part.data ?? part.partial;
            return report?.name ? <h2 key={index}>{report.name}</h2> : null;
          }
          return null;
        }),
      )}
      {final ? <p>{final.oneLiner}</p> : null}
    </>
  );
}
```

You can also read the object from `await chat()` when you do not stream. See [Harness Agents](../structured-outputs/harnesses) for the full part list and the repo-report example.

## Models and options

`acpCompatible` has no built-in model list. The model is any string that your agent takes, or one of the `models` that you declare.

### Configuration

Pass these to `acpCompatible` or as the second argument of `acpCompatibleText`:

| Field | What it does |
| --- | --- |
| `name` (required) | The harness label, the log prefix, and the name of the `<name>.session-id` custom event. |
| `command` | Builds the stdio launch command from `{ model, cwd, harnessCwd, sandbox, env, modelOptions, signal }`. Required unless you pass `openTransport`. |
| `openTransport` | Opens any `AcpSessionTransport` yourself, for example a WebSocket. It overrides `command`. See [WebSocket and custom transports](#websocket-and-custom-transports). |
| `models` | The model ids that the harness takes. With this list, unknown ids are a type error. |
| `modelOptions` | Type-only brand for the per-call options of `chat({ modelOptions })`. Declare it with `{} as { ... }`. |
| `cwd` | The working directory inside the sandbox. Default `/workspace`. |
| `env` | More environment variables for the agent process. |
| `authMode` | `'api-key'` (default) uses `authMethodId`. `'host'` skips ACP `authenticate`. See [Harness Auth](../sandbox/auth). |
| `authMethodId` | The ACP auth method to select before the session starts. Ignored when `authMode` is `'host'`. |
| `permissionMode` | `'default'`, `'acceptEdits'`, or `'bypassPermissions'` (default). |
| `permissions` | `'headless'` (default) answers each request. `'interactive'` sends approval-requested events for `ask` prompts. |
| `onPermissionRequest` | Your own permission handler. It overrides `permissions` and `permissionMode`. |

More options, for special cases:

| Field | What it does |
| --- | --- |
| `skillsDir` | The skills directory of the agent, relative to the workspace root, for example `'.pi/skills'`. Workspace `gitSkill`s are linked here. Without it, they stay unlinked and the adapter logs a warning. |
| `refusalMessage` | The `RUN_ERROR` message when the agent refuses a request. |
| `planEventName` | Send ACP `plan` updates as a custom event with this name. |
| `emitDiff` | Send the `git diff` of `cwd` after the run as a `file.changed` custom event. Off by default. Needs a git repo at `cwd`. |
| `onExtNotification` | Handles vendor `_x/...` JSON-RPC notifications. It must not throw. |
| `buildPrompt` | Changes how the chat history becomes the prompt of the agent. |

This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the agent process sends the model requests.

## Advanced

### WebSocket and custom transports

Some agents run an ACP server that you reach over WebSocket, not stdio (the `grok agent serve` pattern). Open the transport yourself with `openTransport`. It gets the same context as `command` and returns an `AcpSessionTransport`. Put all teardown in the `dispose` of the transport:

```ts
import { acpCompatible, startAcpServerInSandbox } from "@tanstack/ai-acp";

export const myAgent = acpCompatible({
  name: "my-agent",
  openTransport: async ({ sandbox, model, harnessCwd, signal }) => {
    const server = await startAcpServerInSandbox(sandbox, {
      port: 9100,
      cwd: harnessCwd,
      command: `my-agent serve --bind 0.0.0.0:9100 -m ${model}`,
      readyMarker: "listening",
      buildWsUrl: ({ channel, port }) =>
        `${channel.url.replace(/^http/i, "ws")}:${port}`,
      ...(signal ? { signal } : {}),
    });
    const ws = await server.connect(signal);
    return {
      kind: "stream",
      stream: ws.stream,
      dispose: async () => {
        ws.close();
        await server.dispose();
      },
    };
  },
});
```

### Workspace skills

When you set up a [workspace](../sandbox/workspace) with `withSandbox`, `acpCompatible` puts its skills where the agent expects them:

| Workspace input | What `acpCompatible` does |
| --- | --- |
| `mcpSkill(name, config)` | Passes the server to the agent over ACP, in the `mcpServers` of `newSession`, with secrets and bearer headers resolved. No config file is needed. |
| `gitSkill({ repo })` | Clones the repo during bootstrap, then links it into your [`skillsDir`](#configuration). Without `skillsDir`, it stays unlinked and the adapter logs a warning. |
| `fileSkill({ path, content })` | Writes the file into the workspace root during bootstrap. |
| `instructions` | Writes them to `AGENTS.md` (and symlinks) during bootstrap. |
| `agentSkill(name)`, `plugins` | Skipped with a warning, because ACP has no generic way to pass them. Use a `gitSkill` or an MCP server. |

The workspace `secrets` go into the environment of the agent on create and on resume. They are never saved to snapshots. The agent CLI reads them like any environment variable.

### Protocol coverage

`acpCompatible` implements the client side of ACP: enough to drive an agent through a full prompt turn. It is a minimal client that follows the spec. Each part it does not implement is either gated by a capability, so it advertises no support, or a rendering choice.

It covers:

- The `initialize` handshake. It sends `clientInfo` and the protocol version, agrees on the version, and advertises capabilities.
- `authenticate` (when the agent advertises auth methods), `session/new`, `session/load` (resume), `session/prompt`, and `session/cancel`.
- `session/request_permission` with all four option kinds, mapped by the [permission mode](#permissions).
- The streamed `session/update`s that carry turn output: `agent_message_chunk`, `agent_thought_chunk` (as reasoning), `tool_call`, `tool_call_update`, and `plan`.
- All five stop reasons: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, and `cancelled`.

Some output arrives as `CUSTOM` stream events, because the AG-UI chat events have no event for non-text assistant output:

- `<name>.session-id`: the session id of the agent, for [resume](#session-resume).
- `<name>.message-content`: non-text agent content (`image`, `audio`, `resource`, or `resource_link` blocks). Its `value` is `{ content: <ACP content block> }`. Non-text tool content (diffs, terminal output, images) stays inside the `TOOL_CALL_RESULT` payload.
- The plan event, when you set `planEventName`.

It does not implement:

- `fs/read_text_file`, `fs/write_text_file`, and `terminal/*`. It advertises them as unsupported. The agent runs inside the sandbox with direct file and shell access, so it never sends these back to the client.
- Multimodal prompts. Prompts go to the agent as text. Multimodal output of the agent arrives as `message-content`, shown above.
- Incremental `usage_update` (the final usage of the turn arrives instead), `available_commands_update`, `current_mode_update`, and the experimental features (elicitation, NES, providers, session modes and config).

To find agents, see the [ACP agents list](https://agentclientprotocol.com/get-started/agents). For how harnesses fit with sandboxes, see [Harnesses](../sandbox/harnesses).
