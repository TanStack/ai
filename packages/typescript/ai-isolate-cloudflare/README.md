# @tanstack/ai-isolate-cloudflare

Cloudflare Workers driver for TanStack AI Code Mode. Execute LLM-generated code on Cloudflare's global edge network.

## Important: Deployment Required

Due to Cloudflare Workers security model, the `unsafe_eval` binding required for dynamic code execution is **only available on Cloudflare's network**. This means:

- **Production**: Works when deployed to Cloudflare Workers
- **Local development**: Requires `wrangler dev --remote` (connects to Cloudflare's network)
- **Fully local**: Not supported (eval is disabled for security)

## Setup

### 1. Install the package

```bash
pnpm add @tanstack/ai-isolate-cloudflare
```

### 2. Deploy the Worker

```bash
# Login to Cloudflare
npx wrangler login

# Deploy the Worker
cd node_modules/@tanstack/ai-isolate-cloudflare
npx wrangler deploy
```

### 3. Use the driver

```typescript
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'
import { createCodeMode } from '@tanstack/ai-code-mode'

const driver = createCloudflareIsolateDriver({
  workerUrl: 'https://tanstack-ai-code-mode.your-account.workers.dev',
  authorization: 'Bearer your-secret-token', // optional
})

const codeMode = createCodeMode({
  adapter: yourTextAdapter,
  tools: yourTools,
  driver,
})

const result = await codeMode.execute('Calculate 5 + 3')
```

## Local Development

For local development, you have two options:

### Option 1: Use `--remote` (Recommended)

This runs your Worker locally but connects to Cloudflare's network for bindings:

```bash
npx wrangler dev --remote --config wrangler.toml
```

### Option 2: Use a different driver locally

For local-only development, use the Node.js or QuickJS driver:

```typescript
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'

// For local development
const driver =
  process.env.NODE_ENV === 'production'
    ? createCloudflareIsolateDriver({ workerUrl: 'https://...' })
    : createNodeIsolateDriver()
```

## Security

The Worker uses the `unsafe_eval` binding which enables `eval()` within the Worker. This is required for executing dynamic code.

**Important security considerations:**

1. **Protect your Worker endpoint**: Use the `authorization` option and validate tokens
2. **Add rate limiting**: Consider adding Cloudflare Rate Limiting
3. **Use Cloudflare Access**: For additional authentication

## Enterprise: Workers for Platforms

For production deployments at scale, consider [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/) which is designed for multi-tenant code execution.

## API

### `createCloudflareIsolateDriver(config)`

Creates a Cloudflare Workers isolate driver.

#### Config options:

- `workerUrl` (required): URL of the deployed Cloudflare Worker
- `authorization` (optional): Authorization header value for protecting the endpoint
- `timeout` (optional): Execution timeout in ms (default: 30000)
- `maxToolRounds` (optional): Maximum tool callback rounds (default: 10)

## Architecture

```
┌─────────────┐         ┌──────────────────────┐
│   Driver    │  POST   │  Cloudflare Worker   │
│  (Host)     │────────>│  (Edge Network)      │
│             │         │                      │
│  - Tools    │         │  - Execute code      │
│  - Results  │<────────│  - Request tools     │
└─────────────┘         └──────────────────────┘

Flow:
1. Driver sends code + tool schemas to Worker
2. Worker executes code, collects tool calls
3. If tool calls needed, Worker returns them to Driver
4. Driver executes tools locally, sends results back
5. Worker continues execution with tool results
6. Final result returned to Driver
```
