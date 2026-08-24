# @tanstack/ai-lovable

Lovable AI Gateway adapter for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-lovable
```

## Auth

Set `LOVABLE_API_KEY`. Lovable creates this key per Cloud project.

```bash
export LOVABLE_API_KEY="..."
```

You can also pass the key to a `create*` factory.

## Usage

```typescript
import { chat } from '@tanstack/ai'
import { lovableText } from '@tanstack/ai-lovable'

const adapter = lovableText('google/gemini-3.7-flash')

const stream = chat({
  adapter,
  messages: [{ role: 'user', content: 'Hello' }],
})
```

The default text adapter uses the Responses API. Pass `{ api: 'chat' }` for Chat Completions.

See [docs/adapters/lovable.md](../../docs/adapters/lovable.md) for chat, images, video, embeddings, speech, transcription, and BYOK.
