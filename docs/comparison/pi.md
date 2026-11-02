---
title: TanStack AI vs pi
id: pi
order: 2
description: "Pick between TanStack AI and pi: where the agent can run, when each one fits, how the core APIs map, and a feature table."
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

pi is built for an agent that runs in one process: a terminal coding agent, a bot, or a script. TanStack AI does that too, and it also lets you split the agent across a client and a server. Pick pi if you want pi's coding agent CLI or its subscription logins. Pick TanStack AI for everything else, and for any app with a browser in it.

Both are open-source TypeScript toolkits under the MIT license. Both stream model output, call tools, run an agent loop, and talk to many providers. The difference is where the agent can run.

## Where the agent runs

| | pi | TanStack AI |
| --- | --- | --- |
| In one process | Yes. `agentLoop()` runs next to the code that reads its events (`agent.subscribe`) | Yes. `chat()` returns an async stream you read in the same process. A harness keeps a session open across turns |
| In a terminal | `pi-tui`, or `pi-coding-agent` | `runCli` from `@tanstack/ai-harness-cli`: line mode, print mode for scripts and CI, NDJSON, and ACP for editors |
| Split across client and server | Not built in. `pi-protocol` and RPC mode can send events to another process. `streamProxy` keeps the loop in the browser and sends only the model call through your server | Built in. The loop and the server tools run on the server. The browser gets [AG-UI](https://docs.ag-ui.com/) events over HTTP and renders them with `useChat` |
| With a browser UI | Your own code | `useChat` for React, Solid, Vue, Svelte, Preact, Angular and more, with approvals, reconnects and saved history |

So pi gives you an agent to embed in one process. TanStack AI gives you the same agent, plus a client and a server that talk to each other when you need them.

## Pick TanStack AI when

- **You build a terminal agent, a bot, or a script.** `chat()` runs the loop in your process. A [harness](../harness/overview) keeps the conversation open, queues and steers messages, and runs typed agents from code. See [Run a harness in the terminal](../harness/cli).
- **You build a web app.** `useChat` renders the run on the client, and the run survives a slow network or a reload. See [UI](../ui/react) and [Resumable Streams](../resumable-streams/overview).
- **Your tools must run on the server.** Database calls, secrets and paid APIs stay on the server. The browser never sees them.
- **You want to define a tool once.** One schema gives the input and output types on the server and on the client. Add `.server()` or `.client()` to run it on either side. See [Tools](../tools/tools).
- **You want people to approve tool calls.** `needsApproval` pauses the run, and the user answers in the terminal or in the browser. See [Tool approval](../tools/tool-approval).

TanStack AI also has these, each in its own package:

- **Coding-agent harnesses.** Run Claude Code, Codex, OpenCode, Grok Build, or any ACP agent as a chat backend, in a local process or a sandbox. The harness is experimental. See [Coding agents](../harness/coding-agents).
- **Subagents.** A tool can run a child agent, and the client shows its run as a card. See [Subagents](../chat/subagents).
- **Persistence.** Writes to your database, in your schema. See [Persistence](../persistence/overview).
- **Media beyond chat.** Images, video, speech, transcription, music and realtime voice use the same adapters and persistence as chat. See [Generations](../media/generations).

## Pick pi when

- **You want pi's coding agent as the product.** `pi-coding-agent` is a finished terminal agent that reads, edits and runs code in your repo. It saves sessions and loads extensions and skills.
- **You sign in with a model subscription.** pi has OAuth logins for Claude Pro and Max, ChatGPT, GitHub Copilot and OpenRouter.
- **The loop must stay in the browser.** `streamProxy` keeps the loop and the tools on the user's machine and sends only the model call through your server.

## How the core APIs map

| pi                                                                                | TanStack AI                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@earendil-works/pi-ai`                                                           | `@tanstack/ai` and one adapter package per provider                |
| `createModels()`, `setProvider(anthropicProvider())`, `models.getModel('anthropic', id)` | `anthropicText(id)` from `@tanstack/ai-anthropic`                  |
| `models.streamSimple(model, context)`                                             | `chat({ adapter, messages })`                                      |
| `models.completeSimple(model, context)`                                           | `chat({ adapter, messages, stream: false })`                       |
| `systemPrompt` in the context                                                     | `systemPrompts: ['...']`                                           |
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
| Main use               | An agent in one process: coding agent CLI, and the libraries under it         | Agents in one process, in a terminal, or split across client and server                                               |
| Wire protocol          | In-process `AgentEvent` objects. Remote sessions over CBOR (`pi-protocol`)    | Native AG-UI, in both directions                                                                                      |
| Providers              | About 35 in `pi-ai`, plus any OpenAI-compatible API                           | OpenAI, Anthropic, Gemini, Vertex, Bedrock, Grok, Groq, Mistral, OpenRouter, and more. Any OpenAI-compatible endpoint |
| Subscription logins    | OAuth for Claude Pro and Max, ChatGPT, GitHub Copilot, OpenRouter (Node only) | API keys                                                                                                              |
| UI                     | `pi-tui` for the terminal                                                     | Terminal (`runCli`), plus React, Solid, Vue, Svelte, Preact, Angular, Octane, Remix, React Native                     |
| Tools                  | `AgentTool` with a TypeBox schema, run in the agent                           | One `toolDefinition()`, with `.server()` and `.client()`                                                              |
| Tool approval          | `beforeToolCall` can block a call                                             | Per-tool `needsApproval`, with batched approvals and interrupts                                                       |
| Steering and follow-up | Built-in queues on the `Agent`                                                | A message queue in `useChat`. The harness also steers a running turn (experimental)                                   |
| Subagents              | Task-owned child conversations in `pi-durable` (experimental)                 | Built in, with a card per child run                                                                                   |
| Structured output      | Constrained sampling for tool arguments                                       | Typed message part, streamed with tools and kept in the history                                                       |
| Token usage            | Usage and cost on each assistant message                                      | Usage on each model call, and cost when the provider reports it                                                       |
| Persistence            | JSONL session files with branching. `pi-durable` is experimental              | `withPersistence` middleware, server or browser stores                                                                |
| Resumable streams      | `pi-durable` resumes a turn after a crash (experimental)                      | Built in. `useChat` reconnects by itself                                                                              |
| MCP client             | `pi-mcp`: stdio and Streamable HTTP                                           | `@tanstack/ai-mcp`: multi-server pools, generated types, lazy tools, managed lifecycle                                |
| Code Mode              | `pi-codemode`: QuickJS on Node, Bun and Cloudflare                            | 6 isolate drivers: Node, QuickJS WASM, QuickJS Bun, Cloudflare, Daytona, E2B                                          |
| Coding agents          | `pi-coding-agent`, a CLI with extensions, skills and themes                   | Claude Code, Codex, OpenCode, Grok Build, and any ACP agent, on a local process or a sandbox                          |
| Image                  | Image generation through OpenRouter                                           | Stable, typed per model                                                                                               |
| Video, speech, music   | Not built in                                                                  | Stable                                                                                                                |
| Realtime voice         | Not built in                                                                  | Stable: OpenAI, Gemini, Grok, ElevenLabs                                                                              |

To try TanStack AI, start with the [Quick Start](../getting-started/quick-start).
