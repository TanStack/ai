# @tanstack/ai-isolate-cloudflare

Cloudflare Workers driver for TanStack AI Code Mode.

This package runs generated JavaScript in a Worker and keeps `external_*` tool execution on your host process through a request/response loop.

## Installation

```bash
pnpm add @tanstack/ai-isolate-cloudflare
```

## Environment Guidance

- **Local development:** supported with the package's Miniflare dev server (`pnpm dev:worker`)
- **Remote dev:** supported with `wrangler dev --remote`
- **Production:** supported on Cloudflare accounts with the `unsafe_eval` binding enabled. Before rollout, put the Worker behind authentication (e.g. Cloudflare Access or the `authorization` driver option), rate limiting, and CORS restrictions — running LLM-authored code is a high-trust operation.

If you want a self-contained host without Cloudflare infrastructure, prefer `@tanstack/ai-isolate-node` or `@tanstack/ai-isolate-quickjs`.

## Quick Start

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'
import { z } from 'zod'

const fetchWeather = toolDefinition({
  name: 'fetchWeather',
  description: 'Get weather for a city',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    temperature: z.number(),
    condition: z.string(),
  }),
}).server(async ({ location }) => {
  return { temperature: 72, condition: `sunny in ${location}` }
})

const driver = createCloudflareIsolateDriver({
  workerUrl: 'http://localhost:8787', // local dev server URL
  authorization: 'Bearer your-secret-token', // optional
})

const { tool, systemPrompt } = createCodeMode({
  driver,
  tools: [fetchWeather],
  timeout: 30_000,
})

const result = await chat({
  adapter: yourTextAdapter,
  model: 'gpt-4o-mini',
  systemPrompts: ['You are a helpful assistant.', systemPrompt],
  tools: [tool],
  messages: [{ role: 'user', content: 'Compare weather in Tokyo and Paris' }],
})
```

## Worker Setup

### Option 1: Local Miniflare server

From this package directory:

```bash
pnpm dev:worker
```

This starts a local Worker endpoint (default `http://localhost:8787`) with the `UNSAFE_EVAL` binding configured in `wrangler.toml`.

### Option 3: Production deployment

```bash
wrangler deploy
```

The same `wrangler.toml` `[[unsafe.bindings]]` configuration applies in production. Deploying requires that your Cloudflare account has `unsafe_eval` enabled; without it, the Worker returns an `UnsafeEvalNotAvailable` error. Because this Worker executes LLM-generated code, only deploy it behind authentication, rate limiting, and an allow-listed origin.

### Option 2: Wrangler remote dev

```bash
wrangler dev --remote
```

This runs through Cloudflare's network and can be useful when validating behavior against the hosted runtime.

## API

### `createCloudflareIsolateDriver(config)`

Creates a driver that delegates code execution to a Worker endpoint.

- `workerUrl` (required): URL of the Worker endpoint
- `authorization` (optional): value sent as `Authorization` header
- `timeout` (optional): request timeout in ms (default: `30000`)
- `maxToolRounds` (optional): max Worker <-> host tool callback rounds (default: `10`)

## Worker Entry Export

The package also exports a Worker entrypoint:

```typescript
import worker from '@tanstack/ai-isolate-cloudflare/worker'
```

Use this when you want to bundle or compose the provided worker logic in your own Worker project.

## Security Notes

- Protect the worker endpoint if it is reachable outside trusted infrastructure.
- Validate auth headers server-side if you set `authorization` in the driver.
- Add rate limiting and request monitoring for untrusted traffic.
- Treat generated code execution as a high-risk surface; keep strict input and network boundaries.

## Architecture

```
Host Driver                   Cloudflare Worker
-----------                   ------------------
1) send code + tool schemas -> execute until tool call or completion
2) receive tool requests    <- need_tools payload
3) execute tools locally    -> send toolResults
4) receive final result     <- success/error payload
```
