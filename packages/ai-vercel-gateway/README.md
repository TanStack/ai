# @tanstack/ai-vercel-gateway

Vercel AI Gateway adapter for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-vercel-gateway
```

## Auth

Set `AI_GATEWAY_API_KEY`. If that key is not set, the adapter uses `VERCEL_OIDC_TOKEN`.

```bash
export AI_GATEWAY_API_KEY="..."
```

You can also pass the key to a `create*` factory.

## Usage

```typescript
import { chat } from '@tanstack/ai'
import { vercelGatewayText } from '@tanstack/ai-vercel-gateway'

const adapter = vercelGatewayText('anthropic/claude-opus-5')

const stream = chat({
  adapter,
  messages: [{ role: 'user', content: 'Hello' }],
})
```

The default text adapter uses the Responses API. Pass `{ api: 'chat' }` for Chat Completions.

See [docs/adapters/vercel-gateway.md](../../docs/adapters/vercel-gateway.md) for chat, summarize, embeddings, image generation, and gateway routing.
