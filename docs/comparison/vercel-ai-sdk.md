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

Versions: TanStack AI 1.0 and Vercel AI SDK `ai@7.x`.

| Feature | TanStack AI | Vercel AI SDK |
| --- | --- | --- |
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere. No platform layer | Works anywhere. Optional Vercel platform parts |
| Wire protocol | Native AG-UI, in both directions | Own UI Message Stream. AG-UI only through the external `@ag-ui/vercel-ai-sdk` bridge |
| Providers | OpenAI, Anthropic, Gemini, Vertex, Bedrock, Grok, Groq, Mistral, Cohere, Ollama, OpenRouter, BytePlus, ElevenLabs, fal, Cloudflare Workers AI, and more. Any OpenAI-compatible endpoint through `openaiCompatible` | About 38 first-party provider packages, plus community packages |
| Gateways | Vercel AI Gateway, Cloudflare AI Gateway, OpenRouter, LLM Gateway, Lovable AI Gateway | Vercel AI Gateway (the default provider) |
| Framework packages | React, Solid, Vue, Svelte, Preact, Angular, Octane, Remix, React Native | React, Vue, Svelte, Angular. Solid is community-maintained |
| UI hooks | One hook per activity: chat, structured output, image, video, audio, speech, transcription, summarize, realtime | `useChat`, `useCompletion`, `useObject` |
| Type safety | Per model | Per provider |
| Bundle | One adapter per activity, so you bundle only what you import | One package per provider |
| Tools | One `toolDefinition()`, with `.server()` and `.client()` | `tool()` on the server. Client tools through `onToolCall` |
| Tool approval | Per-tool `needsApproval`, with batched approvals and interrupts | Per-tool `needsApproval` |
| Lazy tool discovery | Any provider, in your own agent loop | Anthropic tool search only (`deferLoading`) |
| Agent loop | Strategy functions `(state) => boolean`. Share the config with `createChatOptions` | `stopWhen` conditions and the `ToolLoopAgent` class |
| Middleware | Named hooks across the whole run: config, chunks, tool calls, usage, finish | `wrapLanguageModel()` around the model |
| Structured output | Typed message part, streamed with tools and kept in the history | Per call (`Output`, `generateObject()`, `streamObject()`) |
| Chat persistence | `withPersistence` middleware, server or browser stores | A pattern: you write `saveChat` and `loadChat` |
| Resumable streams | Built in. `useChat` reconnects by itself | Redis, the `resumable-stream` package, and routes you write |
| Memory | `memoryMiddleware` with Redis, mem0, Honcho, Hindsight, or your own | Third-party memory providers or a custom tool |
| Compaction | `@tanstack/ai-compaction` middleware | - |
| MCP client | `@tanstack/ai-mcp`: multi-server pools, generated types, lazy tools, managed lifecycle | `@ai-sdk/mcp` (stable) |
| MCP Apps | React, Preact, and a framework-agnostic bridge | `experimental_MCPAppRenderer` (React only) |
| Code Mode | 6 isolate drivers: Node, QuickJS WASM, QuickJS Bun, Cloudflare, Daytona, E2B | Experimental `@ai-sdk/code-mode` (QuickJS, Node 22+) |
| Coding agents | Claude Code, Codex, OpenCode, Grok Build, and any ACP agent, on local process, Docker, Daytona, E2B, Vercel, Cloudflare, Sprites, and more | Experimental `HarnessAgent`, centered on Vercel Sandbox |
| Durable agent runs | Detach, journal, takeover, and reaper on any sandbox provider | Workflow SDK on Vercel |
| Computer use | Provider-agnostic, with local, Playwright, and sandbox drivers | Provider-hosted computer-use tools |
| Image | Stable, typed per model | `generateImage()` (stable) |
| Video | Stable, with the async job lifecycle streamed to the client | `experimental_generateVideo()` |
| Speech and transcription | Stable. Word timestamps and diarization | Marked experimental |
| Music and sound effects | `generateAudio()` | - |
| Live worlds and live video | Reactor and World Labs adapters | - |
| Realtime voice | Stable: OpenAI, Grok, ElevenLabs | Experimental `experimental_useRealtime` |
| Devtools | In-app panel for the server and the client | `devToolsMiddleware` and a local inspector (server, dev only) |

To move an app, start with [Migration from Vercel AI SDK](../migration/migration-from-vercel-ai).
