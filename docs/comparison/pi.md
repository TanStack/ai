---
title: TanStack AI vs pi
id: pi
order: 2
description: "Pick between TanStack AI and pi: where the agent runs, when each one fits, how the core APIs map, and a feature table."
keywords:
  - tanstack ai
  - pi
  - pi-ai
  - pi-agent-core
  - pi-coding-agent
  - comparison
  - alternatives
  - ag-ui
  - agent loop
  - coding agent
---

Pick TanStack AI for an app where a browser talks to an agent on your server. Pick pi for an agent that runs in one process: a terminal coding agent, a bot, or a script.

Both are open-source TypeScript toolkits under the MIT license. Both stream model output, call tools, run an agent loop, and talk to many providers. The difference is where the agent runs and who reads its events.

## Where the agent runs

| | pi | TanStack AI |
| --- | --- | --- |
| The agent loop runs | In your process, next to the code that reads its events | On your server |
| Its events go to | Callbacks in the same process (`agent.subscribe`) | A client over HTTP, as [AG-UI](https://docs.ag-ui.com/) events |
| The UI is | A terminal (`pi-tui`), or your own code in the same process | `useChat` in the browser, for React, Solid, Vue, Svelte, Preact, Angular and more |
| In a browser app | The loop and the tools run in the browser. `streamProxy` sends only the model call through your server, to keep the API key there | The loop and the server tools run on the server. The browser renders the run and runs only client tools |

So the two toolkits solve different problems:

- **pi** gives you an agent to embed. You own the process, and the events never leave it.
- **TanStack AI** gives you a client and a server that talk to each other. The protocol, the approvals, the reconnects and the saved history are part of the toolkit.

## Pick TanStack AI when

- **You build a web app.** `useChat` renders the run on the client, and the run survives a slow network or a reload. See [UI](../ui/react) and [Resumable Streams](../resumable-streams/overview).
- **Your tools must run on the server.** Database calls, secrets and paid APIs stay on the server. The browser never sees them.
- **You want to define a tool once.** One schema gives the input and output types on the server and on the client. Add `.server()` or `.client()` to run it on either side. See [Tools](../tools/tools).
- **You want people to approve tool calls.** `needsApproval` pauses the run on the server, and the user answers in the browser. See [Tool approval](../tools/tool-approval).
- **You want to own your data.** Persistence writes to your database, in your schema. See [Persistence](../persistence/overview).

TanStack AI also has these, each in its own package:

- **Coding-agent harnesses.** Run Claude Code, Codex, OpenCode, Grok Build, or any ACP agent as a chat backend, in a local process or a sandbox. See [Harness](../harness/overview).
- **Subagents.** A tool can run a child agent, and the client shows its run as a card. See [Subagents](../chat/subagents).
- **Media beyond chat.** Images, video, speech, transcription, music and realtime voice use the same adapters and persistence as chat. See [Generations](../media/generations).

## Pick pi when

- **Your product is a terminal coding agent.** `pi-coding-agent` is a CLI with read, bash, edit and write tools, sessions, extensions and skills.
- **Your agent has no browser client.** A bot, a CLI or a job reads the agent events in the same Node process.
- **The agent must run on the user's machine.** In a browser app, `streamProxy` keeps the loop and the tools in the browser.
- **You sign in with a model subscription.** pi has OAuth logins for Claude Pro and Max, ChatGPT, GitHub Copilot and OpenRouter.

## How the core APIs map

| pi                                                                                | TanStack AI                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@earendil-works/pi-ai`                                                           | `@tanstack/ai` and one adapter package per provider                |
| `createModels()`, `setProvider(anthropicProvider())`, `getModel('anthropic', id)` | `anthropicText(id)` from `@tanstack/ai-anthropic`                  |
| `models.streamSimple(model, context)`                                             | `chat({ adapter, messages })`                                      |
| `models.completeSimple(model, context)`                                           | `chat({ adapter, messages, stream: false })`                       |
| The leading `system` message                                                      | `systemPrompts: ['...']`                                           |
| `AgentTool` with TypeBox `parameters` and `execute`                               | `toolDefinition({ inputSchema }).server(fn)`                       |
| `agentLoop()` or the `Agent` class                                                | `chat({ tools })`, which runs the loop                             |
| `beforeToolCall` / `afterToolCall`                                                | `middleware: [...]` with tool call hooks                           |
| `agent.followUp(message)`                                                         | The [message queue](../chat/queueing) of `useChat`                 |
| `agent.subscribe()` and `AgentEvent`                                              | The AG-UI events of `chat()`, read by `useChat` on the client      |
| `streamProxy()` in the browser                                                    | `toServerSentEventsResponse` on the server, `useChat` on the client |
| `@earendil-works/pi-mcp`                                                          | `@tanstack/ai-mcp`. See [MCP](../tools/mcp).                       |
| `@earendil-works/pi-codemode`                                                     | `@tanstack/ai-code-mode`. See [Code Mode](../code-mode/code-mode). |

## Feature comparison

Versions: pi `1.4` and TanStack AI 1.0.

| Feature                | pi                                                                            | TanStack AI                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| License                | MIT                                                                           | MIT                                                                                                                   |
| Main use               | An agent in one process: coding agent CLI, and the libraries under it         | Full-stack AI apps: server, client and UI hooks                                                                       |
| Wire protocol          | In-process `AgentEvent` objects. Remote sessions over CBOR (`pi-protocol`)    | Native AG-UI, in both directions                                                                                      |
| Providers              | About 35 in `pi-ai`, plus any OpenAI-compatible API                           | OpenAI, Anthropic, Gemini, Vertex, Bedrock, Grok, Groq, Mistral, OpenRouter, and more. Any OpenAI-compatible endpoint |
| Subscription logins    | OAuth for Claude Pro and Max, ChatGPT, GitHub Copilot, OpenRouter (Node only) | API keys                                                                                                              |
| UI                     | `pi-tui` for the terminal, `pi-web-ui` components                             | React, Solid, Vue, Svelte, Preact, Angular, Octane, Remix, React Native                                               |
| Tools                  | `AgentTool` with a TypeBox schema, run in the agent                           | One `toolDefinition()`, with `.server()` and `.client()`                                                              |
| Tool approval          | `beforeToolCall` can block a call                                             | Per-tool `needsApproval`, with batched approvals and interrupts                                                       |
| Steering and follow-up | Built-in queues on the `Agent`                                                | A message queue in `useChat`                                                                                          |
| Subagents              | Not built in                                                                  | Built in, with a card per child run                                                                                   |
| Structured output      | Constrained sampling for tool arguments                                       | Typed message part, streamed with tools and kept in the history                                                       |
| Token usage            | Usage and cost on each assistant message                                      | Usage on each model call                                                                                              |
| Persistence            | SQLite session backends. `pi-durable` is experimental                         | `withPersistence` middleware, server or browser stores                                                                |
| Resumable streams      | `pi-durable` resumes a turn after a crash (experimental)                      | Built in. `useChat` reconnects by itself                                                                              |
| MCP client             | `pi-mcp`: stdio and Streamable HTTP                                           | `@tanstack/ai-mcp`: multi-server pools, generated types, lazy tools, managed lifecycle                                |
| Code Mode              | `pi-codemode`: QuickJS on Node, Bun and Cloudflare                            | 6 isolate drivers: Node, QuickJS WASM, QuickJS Bun, Cloudflare, Daytona, E2B                                          |
| Coding agents          | `pi-coding-agent`, a CLI with extensions, skills and themes                   | Claude Code, Codex, OpenCode, Grok Build, and any ACP agent, on a local process or a sandbox                          |
| Image                  | Image generation through OpenRouter                                           | Stable, typed per model                                                                                               |
| Video, speech, music   | Not built in                                                                  | Stable                                                                                                                |
| Realtime voice         | Not built in                                                                  | Stable: OpenAI, Grok, ElevenLabs                                                                                      |

To try TanStack AI, start with the [Quick Start](../getting-started/quick-start).
