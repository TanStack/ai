<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-cloudflare

Cloudflare adapter for TanStack AI: Workers AI chat, summarization, embeddings, image generation, text-to-speech, and transcription over the `env.AI` binding or the REST API, with AI Gateway routing for any provider.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-cloudflare
```

## Usage

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import type { Ai } from '@cloudflare/workers-types'

export default {
  async fetch(request: Request, env: { AI: Ai }) {
    const { messages } = await request.json()
    const stream = chat({
      adapter: createCloudflareText('@cf/zai-org/glm-5.3-flash', {
        binding: env.AI,
      }),
      messages,
    })
    return toServerSentEventsResponse(stream)
  },
}
```

Outside a Worker, pass `{ accountId, apiKey }` or set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` and use `cloudflareText(model)`.

See the [docs](https://tanstack.com/ai/latest/docs/adapters/cloudflare) for AI Gateway, media adapters, and model options.
