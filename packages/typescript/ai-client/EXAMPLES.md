# Connection Adapter Examples

## Using `fetchServerSentEvents` with Body Parameters

### Basic Usage

```typescript
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')

const { messages, sendMessage } = useChat({ connection })
```

### With Static Body Parameters

```typescript
const connection = fetchServerSentEvents('/api/chat', {
  body: {
    provider: 'openai',
    model: 'gpt-4o',
  },
})
```

### With Dynamic Body Parameters (Synchronous)

```typescript
const [selectedModel, setSelectedModel] = useState({
  provider: 'openai',
  model: 'gpt-4o',
})

const connection = fetchServerSentEvents('/api/chat', () => ({
  body: {
    provider: selectedModel.provider,
    model: selectedModel.model,
  },
}))
```

### With Dynamic Body Parameters (Asynchronous)

```typescript
const connection = fetchServerSentEvents('/api/chat', async () => {
  const token = await getAuthToken()

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: {
      provider: selectedModel.provider,
      model: selectedModel.model,
      userId: getCurrentUserId(),
    },
  }
})
```

## Complete Example with Model Selector

```typescript
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

type Provider = 'openai' | 'anthropic' | 'gemini'

interface ModelOption {
  provider: Provider
  model: string
  label: string
}

const modelOptions: ModelOption[] = [
  { provider: 'openai', model: 'gpt-4o', label: 'OpenAI - GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'OpenAI - GPT-4o Mini' },
  { provider: 'openai', model: 'gpt-5', label: 'OpenAI - GPT-5' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { provider: 'anthropic', model: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
  { provider: 'anthropic', model: 'claude-haiku-4-0-20250514', label: 'Claude Haiku 4.0' },
  { provider: 'gemini', model: 'gemini-2.0-flash-exp', label: 'Gemini - 2.0 Flash' },
  { provider: 'gemini', model: 'gemini-exp-1206', label: 'Gemini - Exp 1206' },
]

function ChatApp() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(modelOptions[0])

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/tanchat', async () =>
      Promise.resolve({
        body: {
          provider: selectedModel.provider,
          model: selectedModel.model,
        },
      }),
    ),
  })

  return (
    <div>
      <select
        value={modelOptions.indexOf(selectedModel)}
        onChange={(e) => setSelectedModel(modelOptions[e.target.value])}
      >
        {modelOptions.map((option, index) => (
          <option key={index} value={index}>
            {option.label}
          </option>
        ))}
      </select>

      {/* Chat UI */}
    </div>
  )
}
```

## Server-Side Handler

The server-side API route receives the body parameters:

```typescript
// /api/tanchat.ts
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { anthropic } from '@tanstack/ai-anthropic'
import { gemini } from '@tanstack/ai-gemini'

export const Route = createFileRoute('/api/tanchat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const messages = body.messages
        const data = body.data || {}

        // Extract provider and model from data
        const provider = data.provider || 'openai'
        const model = data.model

        // Select adapter based on provider
        let adapter
        switch (provider) {
          case 'anthropic':
            adapter = anthropic()
            break
          case 'gemini':
            adapter = gemini()
            break
          case 'openai':
          default:
            adapter = openai()
            break
        }

        const stream = chat({
          adapter,
          model,
          messages,
          // ... other options
        })

        return toStreamResponse(stream)
      },
    },
  },
})
```

## Using `fetchHttpStream` with Body Parameters

The same pattern works with `fetchHttpStream`:

```typescript
const connection = fetchHttpStream('/api/chat', async () => ({
  body: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.7,
  },
}))
```

## Notes

- The `body` field in `FetchConnectionOptions` is merged with `{ messages, data }` automatically
- Body parameters override the default structure if they have the same keys
- The options function can be async, allowing you to fetch tokens or other dynamic data
- Both `fetchServerSentEvents` and `fetchHttpStream` support this pattern
