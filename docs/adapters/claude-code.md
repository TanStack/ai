---
title: Claude Code
id: claude-code-adapter
order: 11
description: "Run Anthropic's Claude Code agent inside a sandbox from TanStack AI. It reads, edits, and runs code in a real repo and streams each step to your UI."
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

The Claude Code adapter runs the `claude` CLI in a sandbox and streams each step to `chat()`. The agent reads files, edits them, and runs commands in a repo.

You need:

- A sandbox provider. The samples use Docker, so Docker must run on your machine.
- An Anthropic API key, or a `claude login` on the machine.
- The `claude` CLI inside the sandbox. A setup step in the sandbox installs it.

Do you only want a Claude chat, with no repo and no shell? Use the [Anthropic adapter](./anthropic).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai-claude-code @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

The sandbox in step 3 gives this key to the `claude` process as a workspace secret.

Did the machine already run `claude login`? Then you can use that login and no key. See [Harness Auth](../sandbox/auth).

## 3. Run the agent from the server

Define the sandbox once. It clones your repo into a Docker container and installs the `claude` CLI:

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
  id: "claude-code-agent",
  provider: dockerSandbox({ image: "node:22" }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: "owner/app" }),
    setup: [
      "npm install -g @anthropic-ai/claude-code --include=optional && claude --version",
    ],
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
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
import { claudeCodeText } from "@tanstack/ai-claude-code";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: claudeCodeText("claude-opus-4-8"),
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

Ask it "Fix the failing test in utils.test.ts". You see the agent's text, plus a line for each tool it used: `Read`, `Edit`, `Bash`, and more. The agent edited the files inside the container.

## How it works

- `claudeCodeText` declares that it needs a sandbox. `withSandbox(sandbox)` gives it one. Without a sandbox, `chat()` fails at the call site.
- Each `chat()` call runs one full agent turn. Claude Code runs its own loop and its own tools.
- The tools of the agent stream back as `tool-call` parts with the results attached. Your code does not run them.
- The agent runs with `permissionMode: 'bypassPermissions'` by default. The sandbox is the safety boundary. To limit what the agent can do, add a sandbox [Policy](../sandbox/policy).
- When the run ends, the adapter sends a `file.changed` custom event with the `git diff` of the workspace.

To learn more about sandboxes, see [Sandboxes](../sandbox/overview).

## Resume a session

Claude Code keeps its working context between turns: the files it read, the commands it ran, and what it found. The adapter sends the session id of each run as a custom event named `claude-code.session-id`. Send it back in `modelOptions.sessionId` to continue the session.

On the server, read the id from the request:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
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
    adapter: claudeCodeText("claude-opus-4-8"),
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
}
```

- On a resumed session, the adapter sends only the latest user message. The agent already has the rest.
- The event value also has `skills`: the skills that Claude Code loaded when it started. It is an empty array when Claude Code reports none.
- Claude Code saves the session inside the sandbox. Resume works only when the next call runs in the same sandbox. See [Lifecycle & Snapshots](../sandbox/lifecycle).

## Give the agent your own tools

The agent has its own tools for files and the shell. It cannot reach your database or your secrets. Pass your server tools to `chat()`, and the adapter bridges them into the sandbox:

```ts group=tools
import { z } from "zod";
import { chat, toolDefinition } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
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
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  threadId: "thread-1",
  tools: [lookupTicket],
  middleware: [withSandbox(sandbox)],
});
```

- Each tool runs on your server, with its closures and secrets. The result goes back into the sandbox.
- The agent sees the tool as `mcp__tanstack__lookup_ticket`. The adapter removes the prefix, so the events use the name you gave.
- Only server tools work here. A client tool has no server `execute()`, so the agent cannot run it.

For how the bridge reaches your server from each provider, see [Sandbox Tools](../sandbox/tools).

## Tool choice

You want Claude Code to answer in text only, or to use only one of your tools. Pass `toolChoice` to `chat()`:

```ts group=tools
const onlyLookup = chat({
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "What's the status of ticket T-123?" }],
  threadId: "thread-1",
  tools: [lookupTicket],
  toolChoice: { type: "tool", name: "lookup_ticket" },
  middleware: [withSandbox(sandbox)],
});
```

| Value | What the adapter does |
| --- | --- |
| `'auto'` | No change. Claude Code can call every tool. |
| `'none'` | Turns off the built-in tools and bridges none of your tools. Claude Code answers in text. |
| `{ type: 'tool', name }` | Turns off the built-in tools and bridges only the named tool. Claude Code can call only this tool, but it does not have to. |
| `'required'` | No change. Claude Code cannot force a tool call, so the adapter logs a warning the first time. |

For the values on other adapters, see [Choose when the model calls a tool](../tools/tools#choose-when-the-model-calls-a-tool).

## Structured output

You want a typed report after the agent reads the repo. Pass `outputSchema` on the same `chat()` call:

```ts
import { chat } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import { withSandbox } from "@tanstack/ai-sandbox";
import { z } from "zod";
import { sandbox } from "./sandbox";

const Report = z.object({
  summary: z.string(),
  filesChanged: z.array(z.string()),
});

const report = await chat({
  adapter: claudeCodeText("claude-opus-4-8"),
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

- Claude Code runs one turn with its own tools. Tool activity and text stream as usual.
- The adapter passes the schema to `--json-schema` as inline JSON. The CLI does not take a file path.
- The object arrives as `structured-output.complete`. This also works when Claude sends it through its built-in `StructuredOutput` tool.

Do you only need JSON from a prompt, with no repo? Use `@tanstack/ai-anthropic`. That is faster. For the full walkthrough, see [Harness Agents](../structured-outputs/harnesses).

## Models and options

### Models

| Model | Reasoning levels | What `reasoning` sets |
| --- | --- | --- |
| `claude-opus-4-8`, `claude-opus-4-7`, `opus` | `low`, `medium`, `high`, `xhigh`, `max` | `--effort` |
| `claude-opus-4-6`, `claude-sonnet-4-6`, `sonnet` | `low`, `medium`, `high`, `max` | `--effort` |
| `claude-haiku-4-5`, `haiku` | `off`, `minimal`, `low`, `medium`, `high` | `MAX_THINKING_TOKENS` |

The package exports this list as `CLAUDE_CODE_MODELS`. The adapter also takes any other Claude model id as a string.

### Reasoning

Set `reasoning` on `chat()`:

```ts
import { chat } from "@tanstack/ai";
import { claudeCodeText } from "@tanstack/ai-claude-code";
import { withSandbox } from "@tanstack/ai-sandbox";
import { sandbox } from "./sandbox";

const stream = chat({
  adapter: claudeCodeText("claude-opus-4-8"),
  messages: [{ role: "user", content: "Refactor the auth module" }],
  threadId: "thread-1",
  reasoning: "xhigh",
  middleware: [withSandbox(sandbox)],
});
```

For `claude-haiku-4-5`, the level picks a token budget. You can also set the budget with `budgetTokens`. `off` sends `0`. See [Reasoning](../chat/reasoning).

### Adapter options

Pass these as the second argument of `claudeCodeText`:

| Option | What it does |
| --- | --- |
| `cwd` | The working directory inside the sandbox. Default `/workspace`. |
| `permissionMode` | `'default'`, `'acceptEdits'`, `'bypassPermissions'`, or `'plan'`. Default `'bypassPermissions'`. |
| `allowedTools` | Built-in tools that the agent can use (`--allowedTools`), for example `['Read', 'Grep', 'Bash(npm test:*)']`. |
| `disallowedTools` | Built-in tools that the agent cannot use (`--disallowedTools`). |
| `addDirs` | More directories that the agent can access (`--add-dir`). |
| `maxTurns` | The maximum number of agent turns in one run. |
| `settingSources` | Which Claude Code settings to load. Default `['project']`. See [Settings sources](#settings-sources). |
| `systemPromptMode` | `'append'` (default) adds your `systemPrompts` to the Claude Code prompt. `'replace'` sends only yours. |
| `authMode` | `'api-key'` (default) gives `ANTHROPIC_API_KEY` to the process. `'host'` uses `claude login`. See [Harness Auth](../sandbox/auth). |
| `claudeExecutable` | The path or name of the `claude` executable in the sandbox. Default `claude`. |
| `streamPartials` | Stream text and tool arguments token by token. Default `true`. With `false`, each arrives whole. |
| `env` | More environment variables for the `claude` process. |
| `emitDiff` | Send the `file.changed` event with the `git diff` after the run. Default `true`. |

### Per-call options

Pass these in `modelOptions` on `chat()`. They override the adapter options for one call:

- `sessionId`: resume a session. See [Resume a session](#resume-a-session).
- `cwd`, `maxTurns`, `permissionMode`, `allowedTools`, `disallowedTools`.
- `authMode`: `'host'` or `'api-key'`.

## Advanced

### Permissions and policy

A headless run has no person to answer a permission prompt. So the default `permissionMode` is `'bypassPermissions'`, and the sandbox is the boundary.

- To allow fewer actions, set `permissionMode`, `allowedTools`, or `disallowedTools`.
- To allow, ask, or deny each command and capability, add a sandbox [Policy](../sandbox/policy). The adapter maps the policy to Claude Code flags and answers the permission prompts of Claude Code from it.
- If the policy says `ask`, the adapter sends an approval-requested event and denies the action. The client approves, then runs the turn again.

### Settings sources

By default, the adapter loads only the project settings (`--setting-sources project`):

- The workspace `CLAUDE.md`, `.claude/skills`, and `.mcp.json` apply to the run.
- A cloned repo's `.claude/settings.json` and hooks also apply.
- The host `~/.claude` (your personal plugins, hooks, and skills) does not load. This matters on the local-process provider.

For the same behavior as the CLI, pass `settingSources: ['user', 'project', 'local']`. To load no settings, pass `[]`.

The adapter does not pass `--bare`, because that flag ignores a host `claude login`.

### How tool choice changes the CLI flags

For `'none'` and a named tool, the adapter passes `--tools ""` and `--strict-mcp-config`. Then other MCP servers, for example from the workspace or a settings file, do not load.

### Token usage

`RUN_FINISHED.usage.promptTokens` counts the full input, cached tokens included. See [Token usage](../chat/stream-events#token-usage).

### Limitations

- **A sandbox is required.** Every call needs `withSandbox(...)`.
- **The agent owns the loop.** TanStack agent-loop strategies and per-iteration middleware do not apply inside a turn. Use `maxTurns` to limit the turn.
- **No sampling options.** Options such as `temperature` do not exist here.
- **Sessions stay in the sandbox.** Resume needs the same sandbox.
- **Cold starts.** Each call starts a CLI turn, so the first token arrives later than with an HTTP adapter.
- **No `wrapFetch`.** This adapter ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the `claude` process sends the model requests.

### Example apps

- [`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare): a TanStack Start app on Workers. You pick Claude Code, Codex, or Grok Build in the UI. It shows session resume, the tool timeline, and tool bridging.
- [`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web): this adapter on Docker, with durable runs that continue after a page refresh.
