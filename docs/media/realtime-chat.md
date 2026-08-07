---
title: Realtime Voice Chat
id: realtime-chat
order: 2
description: "Voice-to-voice chat with WebRTC/WebSocket, VAD, interruptions, tools, and multimodal input."
keywords:
  - tanstack ai
  - realtime voice
  - voice chat
  - webrtc
  - websocket
  - vad
  - voice ai
  - multimodal
  - useRealtimeChat
---

# Realtime Voice Chat

If you need voice-to-voice AI → token endpoint on the server + `useRealtimeChat` (or `RealtimeClient`) on the client.

Flow:

1. Server: `realtimeToken()` with a token adapter (API key stays server-side)
2. Client: connect with a connection adapter (`openaiRealtime()`, `elevenlabsRealtime()`)
3. VAD, tools, text/image input run over the live session

## 1. Server token endpoint

```typescript ignore
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'
import { createServerFn } from '@tanstack/react-start'

const getRealtimeToken = createServerFn({ method: 'POST' }).handler(
  async () => {
    return realtimeToken({
      adapter: openaiRealtimeToken({
        model: 'gpt-realtime',
      }),
    })
  },
)
```

Works with any HTTP framework — Express, Hono, Fastify, etc.

## 2. Client (React)

```tsx
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'

function VoiceChat() {
  const {
    status,
    mode,
    messages,
    connect,
    disconnect,
    pendingUserTranscript,
    pendingAssistantTranscript,
    inputLevel,
    outputLevel,
  } = useRealtimeChat({
    getToken: () =>
      fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
    adapter: openaiRealtime(),
    instructions: 'You are a helpful voice assistant.',
    voice: 'alloy',
  })

  return (
    <div>
      <p>Status: {status}</p>
      <p>Mode: {mode}</p>
      <button onClick={status === 'idle' ? connect : disconnect}>
        {status === 'idle' ? 'Start Conversation' : 'End Conversation'}
      </button>
      {pendingUserTranscript && <p>You: {pendingUserTranscript}...</p>}
      {pendingAssistantTranscript && <p>AI: {pendingAssistantTranscript}...</p>}
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong>
          {msg.parts.map((part, i) => (
            <span key={i}>
              {part.type === 'text' ? part.content : null}
              {part.type === 'audio' ? part.transcript : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
```

## Providers

### OpenAI (WebRTC)

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'
import { openaiRealtime } from '@tanstack/ai-openai'

const token = await realtimeToken({
  adapter: openaiRealtimeToken({ model: 'gpt-realtime' }),
})

const adapter = openaiRealtime()
```

Env: `OPENAI_API_KEY`. Models: `gpt-realtime`, `gpt-realtime-mini`. Voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`.

### ElevenLabs (WebSocket)

Configure the agent in the ElevenLabs dashboard.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({ agentId: 'your-agent-id' }),
})

const adapter = elevenlabsRealtime()
```

Env: `ELEVENLABS_API_KEY`, optional `ELEVENLABS_AGENT_ID`. Setup: [ElevenLabs adapter](../adapters/elevenlabs).

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const { status, messages, connect, disconnect } = useRealtimeChat({
  getToken: () => fetch('/api/elevenlabs-token').then((r) => r.json()),
  adapter: elevenlabsRealtime(),
})
```

## Voice activity detection

| Mode | Behavior | Best for |
|------|----------|----------|
| `server` | Provider detects speech | Default |
| `semantic` | End-of-utterance via pauses/sentences | Natural turn-taking |
| `manual` | You call `startListening` / `stopListening` | Push-to-talk |

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

const { startListening, stopListening, updateSession } = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
  vadMode: 'manual',
})

// Runtime switch:
// updateSession({ vadMode: 'semantic' })
```

```tsx ignore
<button onMouseDown={startListening} onMouseUp={stopListening}>
  Hold to talk
</button>
```

Semantic eagerness:

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

const chat = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
  vadMode: 'semantic',
  semanticEagerness: 'low', // waits longer before end-of-speech
})
```

## Tools

```typescript
import { toolDefinition } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a location',
  inputSchema: z.object({
    location: z.string().meta({ description: 'City name' }),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
})

const getWeather = getWeatherDef.client(async ({ location }) => {
  const res = await fetch(`/api/weather?location=${location}`)
  return res.json()
})

const chat = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
  tools: [getWeather],
})
```

Client auto-executes tools; parts appear as `tool-call` / `tool-result`.

## Text and image input

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'
import { base64ImageData } from './assets'

const { sendText, sendImage } = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
})

sendText('What is the weather like today?')
sendImage(base64ImageData, 'image/png')
```

## Audio visualization

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

const {
  inputLevel, // 0–1 mic
  outputLevel, // 0–1 speaker
  getInputFrequencyData,
  getOutputFrequencyData,
  getInputTimeDomainData,
  getOutputTimeDomainData,
} = useRealtimeChat({ getToken, adapter: openaiRealtime() })
```

Levels update every animation frame while connected.

```tsx
function AudioIndicator({ level }: { level: number }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        transform: `scale(${1 + level * 0.5})`,
        backgroundColor: `rgba(59, 130, 246, ${0.3 + level * 0.7})`,
        transition: 'transform 0.1s ease',
      }}
    />
  )
}
```

## Interruptions

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

const { interrupt, mode } = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
})

if (mode === 'speaking') {
  interrupt()
}
```

Server/semantic VAD interrupt automatically. Interrupted messages set `interrupted: true`.

## RealtimeClient (non-React)

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { openaiRealtime } from '@tanstack/ai-openai'

const client = new RealtimeClient({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: openaiRealtime(),
  instructions: 'You are a helpful assistant.',
  voice: 'alloy',
  onMessage: (message) => {
    console.log(`${message.role}:`, message.parts)
  },
  onStatusChange: (status) => console.log('Status:', status),
  onModeChange: (mode) => console.log('Mode:', mode),
})

await client.connect()
client.sendText('Hello!')

const unsub = client.onStateChange((state) => {
  console.log('Messages:', state.messages.length)
})

await client.disconnect()
client.destroy()
```

## Next

- [Tools](../tools/tools) · [Text-to-Speech](./text-to-speech) · [Multimodal](../advanced/multimodal-content) · [ElevenLabs](../adapters/elevenlabs)

## Advanced

### Session options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `getToken` | `() => Promise<RealtimeToken>` | required | Fetch token |
| `adapter` | `RealtimeAdapter` | required | Provider adapter |
| `instructions` / `voice` / `tools` | session config | — | System prompt, voice, client tools |
| `vadMode` | `'server' \| 'semantic' \| 'manual'` | `'server'` | VAD mode |
| `semanticEagerness` | `'low' \| 'medium' \| 'high'` | — | Semantic VAD |
| `autoPlayback` / `autoCapture` | `boolean` | `true` | Play audio / request mic |
| `outputModalities` / `temperature` / `maxOutputTokens` | generation | — | Modalities and limits |

### Lifecycle

**Status:** `idle` → `connecting` → `connected` → `reconnecting` / `error`

**Mode:** `idle` · `listening` · `thinking` · `speaking`

### Message parts

| Type | Fields |
|------|--------|
| `text` | `content` |
| `audio` | `transcript`, `durationMs` |
| `tool-call` | `id`, `name`, `arguments`, `input`, `output` |
| `tool-result` | `toolCallId`, `content` |
| `image` | `data`, `mimeType` |

### Errors

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

const { error } = useRealtimeChat({
  getToken,
  adapter: openaiRealtime(),
  onError: (err: Error) => {
    if (err.message.includes('Permission denied')) {
      alert('Microphone access is required for voice chat.')
    } else {
      console.error('Realtime error:', err)
    }
  },
})
```

### Practices

1. Generate tokens server-side only.
2. Handle mic permission denial.
3. Disconnect on unmount (`useRealtimeChat` does this).
4. Keep voice instructions short and conversational.
5. Keep tool outputs small for real-time turns.
