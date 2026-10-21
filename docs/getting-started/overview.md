---
title: Overview
id: overview
order: 1
description: "TanStack AI is a type-safe TypeScript SDK for AI features. It streams chat, calls tools, and works with any provider and any UI framework."
keywords:
  - tanstack ai
  - ai sdk
  - typescript ai
  - streaming chat
  - tool calling
  - isomorphic tools
  - framework agnostic
  - llm sdk
---

You want to add AI to a TypeScript app: a chat that streams, a model that calls your functions, or an image from a prompt. You do not want to rewrite it when you change providers or frameworks.

TanStack AI gives you one typed API for all of that. Your server talks to the provider through an adapter. Your UI reads the stream through a hook for your framework.

Start here: [Quick Start](./quick-start). You get a streaming chat in about 5 minutes.

## Who it is for

- **You are new and want to try it.** Go to [Quick Start](./quick-start).
- **You have chat and want one more feature.** Start with [Tools](../tools/tools), [Structured Outputs](../structured-outputs/overview), or [Persistence](../persistence/overview).
- **You want to pick or switch a provider.** Open the [OpenRouter adapter](../adapters/openrouter) for 300+ models with one key, or any page under Adapters.
- **You run it in production or extend it.** Read [Middleware](../advanced/middleware), [Resumable Streams](../resumable-streams/overview), and [Sandboxes](../sandbox/overview).
- **You come from 0.x or the Vercel AI SDK.** Read [Upgrade to 1.0](../migration/v1) or [TanStack AI vs Vercel AI SDK](../comparison/vercel-ai-sdk).

## What you get

- **Type safety.** Tool inputs, model options, and message parts are typed from your schemas and the model you pick.
- **Streaming.** Responses stream token by token, from the server route to the UI.
- **Isomorphic tools.** Define a tool once with `toolDefinition()`. Run it on the server with `.server()` or in the browser with `.client()`.
- **Any provider.** OpenRouter, OpenAI, Anthropic, Gemini, Ollama, and more. Swap the adapter, keep the code.
- **Any framework.** React, Vue, Solid, Svelte, Preact, Angular, Octane, Remix, or no framework.

Later, when you need them:

- **Approvals.** Pause a tool call until a person says yes. See [Tool Approval](../tools/tool-approval).
- **Typed decisions.** Ask `choice`, `score`, and `boolean` questions with `decide()`. See [Evaluate](../evaluate/evaluate).
- **Bring your own key.** Users paste their own provider key in the browser. See [Bring Your Own Key](../advanced/byok).

## How it works

A chat has two halves:

1. **The server** calls `chat()` with an adapter and the messages. It returns the stream as a `Response`.
2. **The client** calls a hook such as `useChat()`. The hook sends messages to your server route and renders the parts as they arrive.

Tools fit into the same loop. When the model calls a tool, TanStack AI runs it, sends the result back to the model, and keeps streaming.

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const products = [
  { id: '1', name: 'Blue mug' },
  { id: '2', name: 'Red mug' },
]

const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'Search for products by query',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) =>
  products.filter((product) => product.name.toLowerCase().includes(query)),
)

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Find mugs' }],
  tools: [getProducts],
})
```

## Learn by building

Each tutorial builds one small app from start to finish:

- [Basic Chat](../tutorials/basic-chat): a streaming React chat. The key stays in the browser tab.
- [Generate Image](../tutorials/generate-image): an image from a prompt.
- [Streaming Structured Table](../tutorials/streaming-structured-table): a typed table that fills in from `chat({ outputSchema })`.
- [Subagents](../tutorials/subagents): a researcher, an SEO agent, and a writer in one blog-writing chat.
- [Build an MCP Server](../tutorials/mcp-server): serve a tool, a resource, and a prompt.
- [Computer Use](../tutorials/computer-use): let the model use a web page from screenshots.

## Reference

### Where it runs

The core works in any JavaScript runtime. These hosts are common:

| Host | Notes |
| --- | --- |
| TanStack Start | React Start or Solid Start. |
| Next.js | API routes and App Router. |
| React Router v7 | Loaders and actions. |
| Remix 3 | Controllers return SSE. Call `createChat` in a `clientEntry` island. |
| Express | Node.js server. See [Quick Start: Server Only](./quick-start-server). |
| React Native / Expo | `useChat` with an absolute server URL and an XHR transport. See [Quick Start: React Native](./quick-start-react-native). |

### Core packages

| Package | What it does |
| --- | --- |
| `@tanstack/ai` | The core. `chat()`, streaming, the tool system, agent loop strategies, and adapter types. Model options and content types (text, image, audio, video, document) are typed per model. |
| `@tanstack/ai-client` | A headless chat client for any framework. It holds message state, streams through connection adapters (SSE, HTTP stream, custom), runs server and client tools, and handles approvals. |
| `@tanstack/ai-react` | `useChat` for React, with approvals and typed messages through `InferChatMessages`. |
| `@tanstack/ai-solid` | `useChat` for Solid, with the same features as React. |
| `@tanstack/ai-octane` | `useChat` for Octane, with the same hook names as `@tanstack/ai-react`. The Octane plugin compiles it from `.tsrx` source. |

Vue, Svelte, Preact, Angular, and Remix have their own packages too. See the [API reference](../api/ai) for each one.

### Provider adapters

Each adapter is its own package. Install only the ones you use.

| Package | Provider |
| --- | --- |
| `@tanstack/ai-openrouter` | OpenRouter. 300+ models with one API key. A good first pick. |
| `@tanstack/ai-openai` | OpenAI (GPT models). |
| `@tanstack/ai-anthropic` | Anthropic (Claude). |
| `@tanstack/ai-gemini` | Google Gemini. |
| `@tanstack/ai-vertex` | Gemini on Google Vertex AI. For Claude, Grok, and Mistral on Vertex, use `@tanstack/ai-anthropic/vertex`, `@tanstack/ai-grok/vertex`, and `@tanstack/ai-mistral/vertex`. |
| `@tanstack/ai-ollama` | Ollama (local models). |
| `@tanstack/ai-groq` | Groq. |
| `@tanstack/ai-grok` | xAI Grok. |
| `@tanstack/ai-bedrock` | Amazon Bedrock (Claude, Nova, Llama, and more through AWS). |
| `@tanstack/ai-byteplus` | BytePlus (Seed chat, Seedance video, Seedream image, Seed Speech). |
| `@tanstack/ai-fal` | fal (image and video generation). |
| `@tanstack/ai-reactor` | Reactor (live world and video generation: Orbis, Happy Oyster, LingBot, Helios, FastH3). |
| `@tanstack/ai-worldlabs` | World Labs Marble (persistent 3D world generation). |
| `@tanstack/ai-llmgateway` | LLM Gateway. Hundreds of models through one OpenAI-compatible endpoint. You can host it yourself. |
| `@tanstack/ai-cloudflare` | Cloudflare Workers AI (chat, embeddings, image, speech, transcription, evaluate) and AI Gateway routing. |
| `@tanstack/ai-typesafe` | TypeSafe Jev (typed evaluate decisions). |
| `@tanstack/ai-ollaya` | Local Ollaya `laya` models for typed evaluate decisions. No API key. |
| `@tanstack/ai-lovable` | Lovable AI Gateway (Google and OpenAI chat, image, video, embeddings, and speech through one project key). |

The Adapters section of the sidebar has a page for each provider.
