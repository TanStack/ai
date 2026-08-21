# @tanstack/ai-vertex

Google Vertex AI adapter for [TanStack AI](https://tanstack.com/ai).

Use this package to run Gemini models on Vertex. That gives you regional
endpoints and Google Cloud credentials (ADC, service accounts, or Vertex
express API keys).

Claude on Vertex lives in [`@tanstack/ai-anthropic/vertex`](https://tanstack.com/ai/latest/docs/adapters/anthropic).

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-vertex
```

## Usage

```ts
import { chat } from '@tanstack/ai'
import { vertexText } from '@tanstack/ai-vertex'

const stream = chat({
  adapter: vertexText('gemini-3.7-flash', {
    project: 'my-project',
    location: 'europe-west1',
  }),
  messages: [{ role: 'user', content: 'Hello' }],
})
```

See the [Vertex adapter docs](https://tanstack.com/ai/latest/docs/adapters/vertex).
