# @tanstack/ai-isolate-cloudflare

Cloudflare Workers driver for TanStack AI Code Mode.

This package runs generated JavaScript in a Worker and keeps `external_*` tool execution on your host process through a request/response loop.

## Installation

```bash
pnpm add @tanstack/ai-isolate-cloudflare
```

## Environment Guidance

- **Local development:** supported with `wrangler dev` (the `worker_loader` binding works in local workerd on the Workers Free plan).
- **Remote dev:** supported with `wrangler dev --remote` on a Workers Paid plan.
- **Production:** supported on Cloudflare accounts on the Workers Paid plan ($5/mo). The Free plan rejects `worker_loader` deploys at the API level. Before rollout, put the Worker behind authentication (e.g. Cloudflare Access or the `authorization` driver option), rate limiting, and CORS restrictions — running LLM-authored code is a high-trust operation.

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

### Option 1: Local dev with `wrangler dev`

From this package directory:

```bash
wrangler dev
```

This starts a local Worker endpoint (default `http://localhost:8787`) with the `worker_loader` binding from `wrangler.toml`. Local workerd accepts the binding on the Workers Free plan, so no upgrade is needed for inner-loop iteration.

### Option 2: Wrangler remote dev

```bash
wrangler dev --remote
```

Runs through Cloudflare's network for validation against the hosted runtime. Requires a Workers Paid plan because `worker_loader` is gated to Paid for any edge usage.

### Option 3: Production deployment

```bash
wrangler deploy
```

Requires a Workers Paid plan. The Free plan rejects deploys with `worker_loader` (`code: 10195` — "In order to use Dynamic Workers, you must switch to a paid plan."). Without the binding, the Worker returns a `WorkerLoaderNotAvailable` error. Because this Worker executes LLM-generated code, only deploy it behind authentication, rate limiting, and an allow-listed origin.

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
