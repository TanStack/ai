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

## Session Overrides

You can customize the agent session at two levels: **server-side** (via the token adapter) and **client-side** (via the realtime adapter).

### Server-side overrides (token generation)

Pass overrides to `elevenlabsRealtimeToken()` to bake them into the signed URL:

```typescript
const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: 'your-agent-id',
    overrides: {
      systemPrompt: 'You are a helpful assistant. Be concise.',
      firstMessage: 'Hi! How can I help you today?',
      voiceId: 'your-voice-id',
      language: 'en',
    },
  }),
})
```

| Option         | Type     | Description                                   |
| -------------- | -------- | --------------------------------------------- |
| `systemPrompt` | `string` | Custom system prompt for the agent            |
| `firstMessage` | `string` | First message the agent speaks when connected |
| `voiceId`      | `string` | ElevenLabs voice ID                           |
| `language`     | `string` | Language code (e.g. `'en'`, `'es'`, `'fr'`)   |

### Client-side overrides (adapter options)

Pass overrides to `elevenlabsRealtime()` on the client. These take precedence over token-level overrides for agent prompt, firstMessage, and language.

```typescript
const client = new RealtimeClient({
  getToken: () => fetch('/api/realtime-token').then((r) => r.json()),
  adapter: elevenlabsRealtime({
    overrides: {
      agent: {
        prompt: { prompt: 'You are a helpful assistant.' },
        firstMessage: 'Hello! How can I assist you?',
        language: 'en',
      },
      tts: {
        voiceId: 'your-voice-id',
        speed: 1.0,
        stability: 0.5,
        similarityBoost: 0.8,
      },
      conversation: {
        textOnly: false,
      },
    },
  }),
})
```

| Option                  | Type      | Description                                  |
| ----------------------- | --------- | -------------------------------------------- |
| `agent.prompt.prompt`   | `string`  | System prompt (overrides token instructions) |
| `agent.firstMessage`    | `string`  | First message the agent speaks               |
| `agent.language`        | `string`  | Language code                                |
| `tts.voiceId`           | `string`  | ElevenLabs voice ID                          |
| `tts.speed`             | `number`  | Speaking speed multiplier                    |
| `tts.stability`         | `number`  | Voice stability (0–1)                        |
| `tts.similarityBoost`   | `number`  | Voice similarity boost (0–1)                 |
| `conversation.textOnly` | `boolean` | Disable audio, use text only                 |

### Override precedence

When both levels are set, client-side `overrides.agent.prompt.prompt` takes precedence over the server-side `systemPrompt`. If only the server-side prompt is set, it is used as the fallback.

## Environment Variables

Set `ELEVENLABS_API_KEY` in your environment for server-side token generation.

## Requirements

- ElevenLabs account with Conversational AI agent configured
- Agent ID from ElevenLabs dashboard

## License

MIT
