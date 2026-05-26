<div align="center">
  <img src="https://raw.githubusercontent.com/TanStack/ai/main/media/header_ai.png" alt="TanStack AI" />
</div>

<br />

<div align="center">
  <a href="https://npmjs.com/package/@tanstack/ai" target="_parent">
    <img alt="NPM downloads" src="https://img.shields.io/npm/dm/@tanstack/ai.svg" />
  </a>
  <a href="https://github.com/TanStack/ai" target="_parent">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" />
  </a>
  <a href="https://github.com/TanStack/ai/releases" target="_parent">
    <img alt="Release" src="https://img.shields.io/github/v/release/tanstack/ai" />
  </a>
  <a href="https://bundlephobia.com/result?p=@tanstack/ai@latest" target="_parent">
    <img alt="Bundle size" src="https://badgen.net/bundlephobia/minzip/@tanstack/ai@latest" />
  </a>
  <a href="https://twitter.com/tan_stack">
    <img alt="Follow @TanStack" src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social" />
  </a>
</div>

# TanStack AI

Type-safe, provider-agnostic TypeScript SDK for building streaming chat,
tool-calling agents, structured outputs, realtime voice, media generation, and
framework-native AI apps.

TanStack AI is built from composable activities and provider adapters. Use one
provider or switch between many. Import only chat, or add image, audio, video,
speech, transcription, summarization, realtime, Code Mode, devtools, and
framework bindings as your app needs them.

## <a href="https://tanstack.com/ai">Read the docs -></a>

## Start Here

- [Overview](https://tanstack.com/ai/latest/docs/getting-started/overview) -
  what TanStack AI is and how the packages fit together.
- [Quick Start: React](https://tanstack.com/ai/latest/docs/getting-started/quick-start) -
  add streaming chat to a React app.
- [Quick Start: Vue](https://tanstack.com/ai/latest/docs/getting-started/quick-start-vue) -
  build with Vue composables.
- [Quick Start: Svelte](https://tanstack.com/ai/latest/docs/getting-started/quick-start-svelte) -
  build with Svelte 5 runes.
- [Quick Start: Server Only](https://tanstack.com/ai/latest/docs/getting-started/quick-start-server) -
  use TanStack AI from a server endpoint, script, or backend service.
- [TanStack AI vs Vercel AI SDK](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk) -
  compare architecture, feature coverage, and tradeoffs.

## What You Can Build

- Streaming chat experiences with typed messages, tool calls, reasoning parts,
  and configurable connection adapters.
- Type-safe tools that can run on the server or client from one shared
  `toolDefinition()` contract.
- Structured output flows backed by JSON Schema, Zod, ArkType, Valibot, or
  plain JSON Schema.
- Multimodal prompts and responses that include text, images, audio, video, and
  documents.
- Image, audio, video, speech, transcription, and summarization workflows using
  a shared generation client pattern.
- Realtime voice chat with provider adapters for realtime sessions and token
  minting.
- Code Mode agents that let an LLM write and execute TypeScript in an isolated
  sandbox to orchestrate tools with loops, branches, and parallel calls.
- Devtools and observability pipelines for inspecting messages, tool calls,
  stream chunks, errors, usage, and OpenTelemetry traces.
- Framework-native clients for React, Solid, Vue, Svelte, and Preact, plus a
  headless client for custom runtimes.

## Install

Install the core package and the provider/framework packages your app uses:

```bash
pnpm add @tanstack/ai @tanstack/ai-openai
```

For a React chat UI:

```bash
pnpm add @tanstack/ai @tanstack/ai-client @tanstack/ai-react @tanstack/ai-openai
```

OpenRouter is also a good starting point if you want access to many providers
through one API key:

```bash
pnpm add @tanstack/ai @tanstack/ai-openrouter
```

## Streaming Chat

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const body = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
}
```

Learn more in the
[Chat & Streaming docs](https://tanstack.com/ai/latest/docs/chat/streaming) and
[Connection Adapters docs](https://tanstack.com/ai/latest/docs/chat/connection-adapters).

## Type-Safe Tools

Define a tool once, then attach a server or client implementation with the same
input and output types:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getProducts = toolDefinition({
  name: 'getProducts',
  description: 'Search the product catalog',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
}).server(async ({ query }) => {
  return db.products.search(query)
})
```

Learn more in the
[Tools docs](https://tanstack.com/ai/latest/docs/tools/tools),
[Tool Approval Flow docs](https://tanstack.com/ai/latest/docs/tools/tool-approval),
and
[Lazy Tool Discovery docs](https://tanstack.com/ai/latest/docs/tools/lazy-tool-discovery).

## Structured Outputs

Use `outputSchema` when you need typed objects instead of freeform text:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const Person = z.object({
  name: z.string(),
  age: z.number(),
})

const person = await chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{ role: 'user', content: 'Ada Lovelace, 36' }],
  outputSchema: Person,
})
```

Learn more in the
[Structured Outputs docs](https://tanstack.com/ai/latest/docs/structured-outputs/overview).

## Media, Realtime, and Code Mode

- [Generations](https://tanstack.com/ai/latest/docs/media/generations) - one
  pattern for image generation, text-to-speech, transcription, summarization,
  audio generation, and video generation.
- [Realtime Voice Chat](https://tanstack.com/ai/latest/docs/media/realtime-chat) -
  build low-latency realtime voice experiences.
- [Code Mode](https://tanstack.com/ai/latest/docs/code-mode/code-mode) - let
  models write and execute TypeScript inside a secure isolate.
- [Code Mode with Skills](https://tanstack.com/ai/latest/docs/code-mode/code-mode-with-skills) -
  give Code Mode reusable runtime capabilities.

## Providers

Official adapters include:

| Package                                                                              | Use it for                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`@tanstack/ai-openrouter`](https://tanstack.com/ai/latest/docs/adapters/openrouter) | 300+ models through one OpenRouter API                                         |
| [`@tanstack/ai-openai`](https://tanstack.com/ai/latest/docs/adapters/openai)         | OpenAI chat, image, video, speech, transcription, realtime, and provider tools |
| [`@tanstack/ai-anthropic`](https://tanstack.com/ai/latest/docs/adapters/anthropic)   | Anthropic Claude chat, thinking, tools, and structured outputs                 |
| [`@tanstack/ai-gemini`](https://tanstack.com/ai/latest/docs/adapters/gemini)         | Google Gemini chat, image, speech, and audio generation                        |
| [`@tanstack/ai-ollama`](https://tanstack.com/ai/latest/docs/adapters/ollama)         | Local Ollama models                                                            |
| [`@tanstack/ai-grok`](https://tanstack.com/ai/latest/docs/adapters/grok)             | xAI Grok chat, images, and realtime                                            |
| [`@tanstack/ai-groq`](https://tanstack.com/ai/latest/docs/adapters/groq)             | Groq low-latency inference                                                     |
| [`@tanstack/ai-elevenlabs`](https://tanstack.com/ai/latest/docs/adapters/elevenlabs) | ElevenLabs realtime voice, speech, transcription, music, and sound effects     |
| [`@tanstack/ai-fal`](https://tanstack.com/ai/latest/docs/adapters/fal)               | fal.ai image, video, audio, speech, and transcription models                   |

The adapter system is tree-shakeable by activity. Import `openaiText` for chat,
`openaiImage` for images, `falVideo` for video, `geminiSpeech` for TTS, and so
on.

## Framework Packages

| Package                                                                    | What it provides                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`@tanstack/ai-client`](https://tanstack.com/ai/latest/docs/api/ai-client) | Headless chat, realtime, and generation clients                          |
| [`@tanstack/ai-react`](https://tanstack.com/ai/latest/docs/api/ai-react)   | React hooks including `useChat`, `useRealtimeChat`, and generation hooks |
| [`@tanstack/ai-solid`](https://tanstack.com/ai/latest/docs/api/ai-solid)   | Solid hooks for chat and generations                                     |
| [`@tanstack/ai-vue`](https://tanstack.com/ai/latest/docs/api/ai-vue)       | Vue composables for chat and generations                                 |
| [`@tanstack/ai-svelte`](https://tanstack.com/ai/latest/docs/api/ai-svelte) | Svelte 5 factories for chat and generations                              |
| [`@tanstack/ai-preact`](https://tanstack.com/ai/latest/docs/api/ai-preact) | Preact hooks for chat                                                    |
| `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, `@tanstack/ai-vue-ui`    | Headless UI components for chat interfaces                               |

## Advanced Docs

- [Middleware](https://tanstack.com/ai/latest/docs/advanced/middleware) - hook
  into chat configuration, chunks, tool calls, usage, errors, and structured
  outputs.
- [OpenTelemetry](https://tanstack.com/ai/latest/docs/advanced/otel) - emit
  vendor-neutral GenAI traces and metrics.
- [Observability](https://tanstack.com/ai/latest/docs/advanced/observability) -
  subscribe to typed TanStack AI events.
- [Per-Model Type Safety](https://tanstack.com/ai/latest/docs/advanced/per-model-type-safety) -
  narrow model options and content modalities to the selected model.
- [Runtime Adapter Switching](https://tanstack.com/ai/latest/docs/advanced/runtime-adapter-switching) -
  switch providers at runtime.
- [Tree-Shaking](https://tanstack.com/ai/latest/docs/advanced/tree-shaking) -
  ship only the activities and adapters you use.
- [Agent Skills](https://tanstack.com/ai/latest/docs/getting-started/agent-skills) -
  install TanStack AI skills into Claude Code, Cursor, GitHub Copilot, Codex,
  and other coding agents with TanStack Intent.

## Get Involved

- Read the [docs](https://tanstack.com/ai).
- Participate in [GitHub discussions](https://github.com/TanStack/ai/discussions).
- Chat with the community on [Discord](https://discord.com/invite/WrRKjPJ).
- See [CONTRIBUTING.md](https://github.com/TanStack/ai/blob/main/CONTRIBUTING.md)
  for setup instructions.
- [Become a sponsor](https://github.com/sponsors/tannerlinsley/).

## Partners

<table align="center">
  <tr>
    <td>
      <a href="https://www.coderabbit.ai/?via=tanstack&dub_id=aCcEEdAOqqutX6OS">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/assets/coderabbit-dark-D643Zkrv.svg" />
          <source media="(prefers-color-scheme: light)" srcset="https://tanstack.com/assets/coderabbit-light-CIzGLYU_.svg" />
          <img src="https://tanstack.com/assets/coderabbit-light-CIzGLYU_.svg" height="40" alt="CodeRabbit" />
        </picture>
      </a>
    </td>
    <td>
      <a href="https://www.cloudflare.com?utm_source=tanstack">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/assets/cloudflare-white-Co-Tyjbl.svg" />
          <source media="(prefers-color-scheme: light)" srcset="https://tanstack.com/assets/cloudflare-black-6Ojsn8yh.svg" />
          <img src="https://tanstack.com/assets/cloudflare-white-Co-Tyjbl.svg" height="60" alt="Cloudflare" />
        </picture>
      </a>
    </td>
  </tr>
</table>

<div align="center">
  <img src="https://raw.githubusercontent.com/TanStack/ai/main/media/partner_logo.svg" alt="AI and you?" height="65" />
  <p>
    We're looking for TanStack AI partners to join our mission. Partner with us
    to push the boundaries of TanStack AI and build amazing things together.
  </p>
  <a href="mailto:partners@tanstack.com?subject=TanStack AI Partnership"><b>LET'S CHAT</b></a>
</div>

## Explore the TanStack Ecosystem

- <a href="https://github.com/tanstack/config"><b>TanStack Config</b></a> -
  tooling for JS/TS packages
- <a href="https://github.com/tanstack/db"><b>TanStack DB</b></a> - reactive
  sync client store
- <a href="https://github.com/tanstack/devtools"><b>TanStack Devtools</b></a> -
  unified devtools panel
- <a href="https://github.com/tanstack/form"><b>TanStack Form</b></a> -
  type-safe form state
- <a href="https://github.com/tanstack/pacer"><b>TanStack Pacer</b></a> -
  debouncing, throttling, batching
- <a href="https://github.com/tanstack/query"><b>TanStack Query</b></a> -
  async state and caching
- <a href="https://github.com/tanstack/ranger"><b>TanStack Ranger</b></a> -
  range and slider primitives
- <a href="https://github.com/tanstack/router"><b>TanStack Router</b></a> -
  type-safe routing, caching, and URL state
- <a href="https://github.com/tanstack/start"><b>TanStack Start</b></a> -
  full-stack SSR and streaming
- <a href="https://github.com/tanstack/store"><b>TanStack Store</b></a> -
  reactive data store
- <a href="https://github.com/tanstack/table"><b>TanStack Table</b></a> -
  headless datagrids
- <a href="https://github.com/tanstack/virtual"><b>TanStack Virtual</b></a> -
  virtualized rendering

...and more at <a href="https://tanstack.com"><b>TanStack.com</b></a>.
