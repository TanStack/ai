# @tanstack/ai-elevenlabs

ElevenLabs adapter for TanStack AI realtime voice conversations.

## Installation

```bash
npm install @tanstack/ai-elevenlabs @tanstack/ai @tanstack/ai-client
```

## Usage

### Server-Side Token Generation

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

// Generate a signed URL for client use
const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: 'your-agent-id',
  }),
})
```

### Client-Side Usage

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const client = new RealtimeClient({
  getToken: () => fetch('/api/realtime-token').then((r) => r.json()),
  adapter: elevenlabsRealtime(),
})

await client.connect()
```

### With React

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

function VoiceChat() {
  const { status, mode, messages, connect, disconnect } = useRealtimeChat({
    getToken: () => fetch('/api/realtime-token').then(r => r.json()),
    adapter: elevenlabsRealtime(),
  })

  return (
    <div>
      <p>Status: {status}</p>
      <p>Mode: {mode}</p>
      <button onClick={status === 'idle' ? connect : disconnect}>
        {status === 'idle' ? 'Start' : 'Stop'}
      </button>
    </div>
  )
}
```

## Environment Variables

Set `ELEVENLABS_API_KEY` in your environment for server-side token generation.

## Requirements

- ElevenLabs account with Conversational AI agent configured
- Agent ID from ElevenLabs dashboard

## License

MIT
