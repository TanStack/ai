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

# @tanstack/ai-neon

Neon AI Gateway adapter for TanStack AI. One Neon credential reaches Claude, GPT, Gemini, and open models.

## Installation

```bash
npm install @tanstack/ai-neon
```

## Auth

Set `NEON_AI_GATEWAY_TOKEN` and `NEON_AI_GATEWAY_BASE_URL`. `neon env pull` writes both.

```bash
NEON_AI_GATEWAY_TOKEN=nt_live_...
NEON_AI_GATEWAY_BASE_URL=https://<branch>-api.ai.<cell>.<region>.aws.neon.tech
```

You can also pass the token and `baseURL` to a `create*` factory.

## Usage

```typescript
import { chat } from '@tanstack/ai'
import { neonText } from '@tanstack/ai-neon'

const stream = chat({
  adapter: neonText('claude-opus-5-5'),
  messages: [{ role: 'user', content: 'Hello' }],
  threadId: 'thread-1',
})
```

`neonText` sends Claude to the Anthropic Messages endpoint, `gpt-5-3-codex` and `gpt-5-5-pro` to the Responses endpoint, and every other model to Chat Completions. Pass `{ api: 'responses' }` to use Responses for another GPT model.

See [docs/adapters/neon.md](../../docs/adapters/neon.md) for chat, reasoning, embeddings, and summarize.
