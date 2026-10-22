---
title: TanStack AI vs Vercel AI SDK
id: vercel-ai-sdk
order: 1
description: "Pick between TanStack AI and the Vercel AI SDK: when each one fits, how the core APIs map, and a feature table."
keywords:
  - tanstack ai
  - vercel ai sdk
  - comparison
  - ai sdk
  - alternatives
  - ag-ui
  - typescript ai sdk
  - tool calling
  - persistence
  - resumable streams
  - code mode
  - sandbox
  - vercel ai gateway
---

Pick TanStack AI for a new app. Stay on the Vercel AI SDK if your app already speaks its UI Message Stream protocol.

Both are open-source TypeScript toolkits. Both stream chat, call tools, talk to many providers, and run on any host. TanStack AI streams the open [AG-UI](https://docs.ag-ui.com/) protocol. The Vercel AI SDK streams its own protocol.

## Pick TanStack AI when

- **You want an open protocol.** The server and the client talk AG-UI, in both directions. Any AG-UI agent or client can sit on the other side of the wire.
- **You want typed models.** Pick a model and TypeScript narrows the options and input types to what that model supports. See [Per-Model Type Safety](../advanced/per-model-type-safety).
- **You want to define a tool once.** One schema gives the input and output types on the server and on the client. Add `.server()` or `.client()` to run it on either side. See [Tools](../tools/tools).
- **You want to own the UI.** Text, thinking, tool calls, and tool results arrive as typed message parts, each with its own state. Render them however you like. See [UI](../ui/react).
- **You want to own your data.** Persistence writes to your database, in your schema. A reload in the middle of a reply loses nothing, because each chunk goes to a log before delivery. See [Persistence](../persistence/overview) and [Resumable Streams](../resumable-streams/overview).

TanStack AI also does the hard parts. Each one is its own package, so you load only what the task needs:

- **Code Mode.** The model chains your tools in one script and runs it in an isolate. See [Code Mode](../code-mode/code-mode).
- **Coding-agent harnesses.** Run Claude Code, Codex, OpenCode, Grok Build, or any ACP agent as a chat backend, in a local process or a sandbox. See [Sandboxes](../sandbox/overview).
- **MCP and MCP Apps.** A typed MCP client, a CLI that generates the types, and interactive widgets from tool results. See [MCP Apps](../mcp/apps).
- **Memory and compaction.** Recall across sessions through Redis, mem0, Honcho, or Hindsight. Compaction keeps long threads inside the context window. See [Memory](../memory/overview) and [Compaction](../advanced/compaction).
- **Media beyond chat.** Images, video, speech, transcription, music, realtime voice, and live worlds use the same adapters and persistence as chat. See [Generations](../media/generations).

Devtools show each tool call, interrupt, memory recall, and finish reason, on the server and in the client, in one timeline. See [Devtools](../getting-started/devtools).

## Stay on the Vercel AI SDK when

Your app already speaks the AI SDK stream protocol. For example, your UI uses `@ai-sdk/react` or AI Elements, or a backend that you do not control emits the UI Message Stream. TanStack AI does not read or write that protocol.

Vercel AI Gateway is not a reason to stay. TanStack AI has a native [Vercel AI Gateway adapter](../adapters/vercel-gateway) for chat, embeddings, and images.

## Your provider is not listed

1. Try [OpenRouter](../adapters/openrouter), [Vercel AI Gateway](../adapters/vercel-gateway), or [`openaiCompatible`](../adapters/openai-compatible). They reach most providers today.
2. Ask for a first-party adapter in [GitHub Discussions](https://github.com/TanStack/ai/discussions).
3. To build one yourself, follow the [community adapter guide](../community-adapters/guide).

## Try TanStack AI in 5 minutes

1. Install the packages for your framework:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane

<!-- ::end:tabs -->

2. Put `OPENAI_API_KEY` in the environment of your server.

3. Add a server route. This is the TanStack AI version of `streamText(...).toUIMessageStreamResponse()`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })

  return toServerSentEventsResponse(stream)
}
```

4. Render the chat with `useChat`. This React example reads text parts from each message:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </>
  )
}
```

Send a message. The reply streams into the page. Other frameworks are in the [Quick Start](../getting-started/quick-start).

## How the core APIs map

| Vercel AI SDK | TanStack AI |
| --- | --- |
| `ai` | `@tanstack/ai` |
| `@ai-sdk/openai` and `openai('model')` | `@tanstack/ai-openai` and `openaiText('model')` |
| `streamText()` | `chat()` |
| `generateText()` | `chat({ stream: false })` |
| `generateObject()` / `streamObject()` / `Output.object()` | `chat({ outputSchema })` |
| `system: '...'` | `systemPrompts: ['...']` |
| `providerOptions: { openai: { ... } }` | `modelOptions: { ... }` (typed per model) |
| `tool({ execute })` | `toolDefinition({ ... }).server(fn)` or `.client(fn)` |
| `stopWhen: stepCountIs(n)` | `agentLoopStrategy: maxIterations(n)` |
| `wrapLanguageModel()`, `onFinish`, `prepareStep` | `middleware: [...]` with `onFinish`, `onConfig`, and more |
| `result.toUIMessageStreamResponse()` | `toServerSentEventsResponse(stream)` |
| `useChat` from `@ai-sdk/react` | `useChat` from `@tanstack/ai-react` |

Every option, result member, and hook difference is in [Migration from Vercel AI SDK](../migration/migration-from-vercel-ai).

## Feature comparison

Versions: Vercel AI SDK `ai@7.x` and TanStack AI 1.0.

| Feature | Vercel AI SDK | TanStack AI |
| --- | --- | --- |
| License | Apache 2.0 | MIT |
| Hosting | Works anywhere. Optional Vercel platform parts | Works anywhere. No platform layer |
| Wire protocol | Own UI Message Stream. AG-UI only through the external `@ag-ui/vercel-ai-sdk` bridge | Native AG-UI, in both directions |
| Providers | About 38 first-party provider packages, plus community packages | OpenAI, Anthropic, Gemini, Vertex, Bedrock, Grok, Groq, Mistral, Cohere, Ollama, OpenRouter, BytePlus, ElevenLabs, fal, Cloudflare Workers AI, and more. Any OpenAI-compatible endpoint through `openaiCompatible` |
| Gateways | Vercel AI Gateway (the default provider) | Vercel AI Gateway, Cloudflare AI Gateway, OpenRouter, LLM Gateway, Lovable AI Gateway |
| Framework packages | React, Vue, Svelte, Angular. Solid is community-maintained | React, Solid, Vue, Svelte, Preact, Angular, Octane, Remix, React Native |
| UI hooks | `useChat`, `useCompletion`, `useObject` | One hook per activity: chat, structured output, image, video, audio, speech, transcription, summarize, realtime |
| Type safety | Per provider | Per model |
| Bundle | One package per provider | One adapter per activity, so you bundle only what you import |
| Tools | `tool()` on the server. Client tools through `onToolCall` | One `toolDefinition()`, with `.server()` and `.client()` |
| Tool approval | Per-tool `needsApproval` | Per-tool `needsApproval`, with batched approvals and interrupts |
| Lazy tool discovery | Anthropic tool search only (`deferLoading`) | Any provider, in your own agent loop |
| Agent loop | `stopWhen` conditions and the `ToolLoopAgent` class | Strategy functions `(state) => boolean`. Share the config with `createChatOptions` |
| Middleware | `wrapLanguageModel()` around the model | Named hooks across the whole run: config, chunks, tool calls, usage, finish |
| Structured output | Per call (`Output`, `generateObject()`, `streamObject()`) | Typed message part, streamed with tools and kept in the history |
| Chat persistence | A pattern: you write `saveChat` and `loadChat` | `withPersistence` middleware, server or browser stores |
| Resumable streams | Redis, the `resumable-stream` package, and routes you write | Built in. `useChat` reconnects by itself |
| Memory | Third-party memory providers or a custom tool | `memoryMiddleware` with Redis, mem0, Honcho, Hindsight, or your own |
| Compaction | - | `@tanstack/ai-compaction` middleware |
| MCP client | `@ai-sdk/mcp` (stable) | `@tanstack/ai-mcp`: multi-server pools, generated types, lazy tools, managed lifecycle |
| MCP Apps | `experimental_MCPAppRenderer` (React only) | React, Preact, and a framework-agnostic bridge |
| Code Mode | Experimental `@ai-sdk/code-mode` (QuickJS, Node 22+) | 6 isolate drivers: Node, QuickJS WASM, QuickJS Bun, Cloudflare, Daytona, E2B |
| Coding agents | Experimental `HarnessAgent`, centered on Vercel Sandbox | Claude Code, Codex, OpenCode, Grok Build, and any ACP agent, on local process, Docker, Daytona, E2B, Vercel, Cloudflare, Sprites, and more |
| Durable agent runs | Workflow SDK on Vercel | Detach, journal, takeover, and reaper on any sandbox provider |
| Computer use | Provider-hosted computer-use tools | Provider-agnostic, with local, Playwright, and sandbox drivers |
| Image | `generateImage()` (stable) | Stable, typed per model |
| Video | `experimental_generateVideo()` | Stable, with the async job lifecycle streamed to the client |
| Speech and transcription | Marked experimental | Stable. Word timestamps and diarization |
| Music and sound effects | - | `generateAudio()` |
| Live worlds and live video | - | Reactor and World Labs adapters |
| Realtime voice | Experimental `experimental_useRealtime` | Stable: OpenAI, Grok, ElevenLabs |
| Devtools | `devToolsMiddleware` and a local inspector (server, dev only) | In-app panel for the server and the client |

To move an app, start with [Migration from Vercel AI SDK](../migration/migration-from-vercel-ai).
