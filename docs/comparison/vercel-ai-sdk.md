---
title: TanStack AI vs Vercel AI SDK
id: vercel-ai-sdk
order: 1
description: "Pick between TanStack AI and the Vercel AI SDK in a few minutes: when to use each, how the core APIs map, and a feature table."
keywords:
  - tanstack ai
  - vercel ai sdk
  - comparison
  - ai sdk
  - alternatives
  - typescript ai sdk
  - tool calling
  - llm
  - persistence
  - resumable streams
  - durable runs
  - code mode
  - sandbox
---

You need to pick a TypeScript AI toolkit, or you already use the Vercel AI SDK and want to know what is different. This page gives you the short answer first, then the API map, then the full feature table.

Both are open-source TypeScript toolkits. Both stream chat, call tools, talk to many providers, and run on any host. The difference is in the approach:

- **TanStack AI** is a library that you compose. You import small pieces (adapters, tools, transports, hooks) and you wire them yourself. It has no platform layer.
- **Vercel AI SDK** is a broad toolkit with optional Vercel platform parts, such as AI Gateway and observability.

This page compares the two from the TanStack AI side. It also says where the Vercel AI SDK is stronger.

## Pick TanStack AI when

- You want TypeScript to narrow options and inputs per model, not per provider.
- You want to define a tool once, then add a server or a client implementation.
- You want persistence, resumable streams, and tool approvals as built-in parts that you turn on.
- You use Solid, Preact, Angular, Octane, Remix, or React Native and want an official package.
- You want an AI layer with no link to a hosting platform.

There are more reasons (AG-UI on the wire, Code Mode, coding-agent sandboxes, stable media APIs). See [the feature-by-feature details](./vercel-ai-sdk-advanced).

## Pick Vercel AI SDK when

- You need a first-party package for a provider that TanStack AI does not cover.
- You want one reusable `Agent` class (`ToolLoopAgent`) that holds the model, tools, and loop settings.
- You deploy on Vercel and want AI Gateway, observability, and deployment tuning.
- You build with React Server Components through `@ai-sdk/rsc` (experimental).
- Your long harness runs already use the Workflow SDK on Vercel.

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

## How they differ

- **Adapters.** TanStack AI has one adapter per activity (`openaiText`, `openaiImage`, `openaiSpeech`). Your bundle holds only the activities you import. AI SDK provider packages hold all model types.
- **Types.** TanStack AI types options and input modalities per model. AI SDK types them per provider.
- **Wire format.** TanStack AI streams [AG-UI](https://docs.ag-ui.com/) events end to end. AI SDK streams its own UI Message Stream.
- **Middleware.** TanStack AI middleware hooks into the whole `chat()` run (config, chunks, tool calls, usage, errors). AI SDK middleware wraps the model.
- **State.** TanStack AI ships middleware for persistence, resumable streams, and durable sandbox runs. With the AI SDK you write the store and the wiring.

## Feature comparison

Versions: TanStack AI at the time of writing, and Vercel AI SDK `ai@7.x`.

| Feature | TanStack AI | Vercel AI SDK |
|---------|------------|---------------|
| License | MIT | Apache 2.0 |
| Hosting | Works anywhere | Works anywhere |
| Providers | 20+ official provider packages (OpenAI, Anthropic, Gemini, Vertex, Grok, Groq, OpenRouter, Ollama, Bedrock, Mistral, Cohere, ElevenLabs, fal, Vercel Gateway, and more), any OpenAI-compatible endpoint through `openaiCompatible`, 5 harness adapters, and community adapters | About 38 first-party provider packages (plus community), and 100+ models through AI Gateway |
| Framework Hooks | React, Solid, Svelte, Vue, Preact, Angular, Octane, Remix (+ React Native) | React, Vue, Svelte, Angular (Solid is community-maintained) |
| Generation UI Hooks | One hook per activity: chat, structured output, image, audio, speech, transcription, summarize, video, realtime | `useChat`, `useCompletion`, `useObject` |
| Wire Protocol | Native AG-UI events end to end | Proprietary UI Message Stream. AG-UI through an external translation layer |
| Streaming | Built-in, with chunk strategies you can configure | Built-in, with progressive delivery |
| Chat Persistence | `withPersistence` middleware + `reconstructChat`. Server store or browser stores (`localStorage`, `sessionStorage`, IndexedDB) | Guide: you own `saveChat` / `loadChat` / `validateUIMessages` |
| Generation Persistence | `withGenerationPersistence` restores long media runs into the same hook fields | - |
| Resumable Streams | `StreamDurability` in core, with `memoryStream` or `durableStream`. `useChat` reconnects on its own | Redis + `resumable-stream` + `activeStreamId`. You wire POST and GET |
| Durable Sandbox Runs | Detach, journal, takeover, reaper. The agent keeps working after the tab closes | `HarnessAgent` + Workflow SDK (experimental), centered on Vercel Sandbox |
| Tool Calling | Isomorphic `.server()` / `.client()` system | `tool()` objects. Client execution through `onToolCall` |
| Agent Loop Control | Composable strategy functions `(state) => boolean` | `stopWhen` conditions + `Agent` (`ToolLoopAgent`) class |
| Tool Approval | Per-tool `needsApproval` with a batched approval flow | Per-tool `needsApproval` (human-in-the-loop) |
| Type Safety | Per-model type narrowing | Per-provider types |
| Tree-Shaking | Separate adapter per activity (text, image, speech, and more) | Monolithic provider packages |
| Lazy Tool Discovery | Built-in, works with every provider | Anthropic-only tool search with `deferLoading` (provider-hosted) |
| Connection Adapters | SSE, HTTP stream, XHR (SSE/stream), RPC, WebSocket, direct async iterables, `fetcher`, custom | SSE-based data stream protocol (`ChatTransport`) |
| Middleware | App-level lifecycle hooks (config, iterations, chunks, tool calls, usage, errors) | Model-level wrapping through `wrapLanguageModel()` |
| Extend Adapter | Add custom or fine-tuned models with per-model type narrowing | `customProvider()` / `createProviderRegistry()` (string model ids) |
| Structured Outputs | Typed `StructuredOutputPart`, streamed next to tools and kept per turn in message history | `generateObject()` / `streamObject()` / `Output` API (per call, no structured-output message part) |
| Image Generation | Stable API with per-model type safety (OpenAI, Gemini, Grok, OpenRouter, fal.ai) | `generateImage()` (stable) |
| Video Generation | Stable API with the async job lifecycle (OpenAI, fal.ai) | `experimental_generateVideo()` |
| Text-to-Speech | Stable API, 6 output formats, speed control (OpenAI, Gemini, Grok, ElevenLabs, fal.ai) | `generateSpeech()` (experimental) |
| Transcription | Stable API with word timestamps and diarization (OpenAI, Grok, ElevenLabs, fal.ai) | `transcribe()` (experimental) |
| Audio / Music Generation | `generateAudio()` for music and sound effects (Gemini, ElevenLabs, fal.ai) | - |
| Summarization | Dedicated `summarize()` with streaming and style options | - |
| Code Mode | 6 isolate drivers that you run yourself: Node `isolated-vm`, QuickJS WASM, QuickJS Bun, Cloudflare, Daytona, E2B | Experimental `@ai-sdk/code-mode` (QuickJS only, Node 22+, not browser or edge), plus provider-hosted code-execution tools |
| Code Mode Skills | Persistent skill library that the LLM writes | Static skill uploads, no library that the model builds |
| Coding Agent Sandboxes | First-party Grok Build, Claude Code, Codex, OpenCode, and any ACP agent through `acpCompatible`. Runs on local-process, Docker, Docker Sandboxes (`sbx`), Daytona, Vercel, Sprites, Cloudflare | `HarnessAgent` (experimental): Claude Code, Codex, Grok Build, OpenCode, Deep Agents, Pi. Centered on Vercel Sandbox |
| Realtime Voice | Stable: OpenAI, Grok, and ElevenLabs with VAD modes and tool support | Experimental `experimental_useRealtime` (OpenAI, Google, xAI + Gateway) |
| DevTools | Isomorphic in-app panel through TanStack DevTools (all frameworks, media previews) | `devToolsMiddleware` + local inspector (server-side, dev only) |
| Debug Logging | One flag, per-category toggles, pluggable logger | Warning logs + experimental telemetry hooks |
| MCP Client | Standalone host-side client (`@tanstack/ai-mcp`) + provider-routed `mcpTool()` | Built-in (`@ai-sdk/mcp`, stable) |
| MCP Apps (Interactive Widgets) | `ui://` widgets through `@mcp-ui/client`. React + Preact + a framework-agnostic bridge. Multi-server routing, pluggable session store, link-scheme hardening | `experimental_MCPAppRenderer` (React only). Model-vs-app tool split. Iframe sandbox + allowlist |
| Platform Association | None, pure library | Optional Vercel integration |

Each row, with code and the trade-offs, is in [TanStack AI vs Vercel AI SDK: Details](./vercel-ai-sdk-advanced).
