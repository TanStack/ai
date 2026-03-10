---
title: Realtime Voice Chat
id: realtime-chat
order: 14
---

TanStack AI provides a complete realtime voice chat system for building voice-to-voice AI interactions. The realtime API supports multiple providers (OpenAI, ElevenLabs), automatic tool execution, audio visualization, and multimodal input including images.

## Overview

Realtime voice chat differs from text-based chat in several key ways:

- **Bidirectional audio** - Users speak into a microphone, and the AI responds with synthesized voice
- **Voice Activity Detection (VAD)** - Automatically detects when the user starts and stops speaking
- **Interruptions** - Users can interrupt the AI mid-response
- **Low latency** - Uses WebRTC or WebSocket connections for near-instant communication
- **Multimodal** - Supports text input, image input, and tool calling alongside voice

The realtime system follows the same adapter architecture as the rest of TanStack AI:

1. **Server** generates ephemeral tokens using `realtimeToken()` with a provider-specific token adapter
2. **Client** connects using `RealtimeClient` (or `useRealtimeChat` in React) with a provider-specific connection adapter
3. **Provider adapters** handle the protocol differences between OpenAI WebRTC, ElevenLabs WebSocket, etc.

## Quick Start

### 1. Set Up the Server Token Endpoint

The server generates short-lived tokens so your API keys never reach the client:

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'
import { createServerFn } from '@tanstack/react-start'

const getRealtimeToken = createServerFn({ method: 'POST' })
  .handler(async () => {
    return realtimeToken({
      adapter: openaiRealtimeToken({
        model: 'gpt-4o-realtime-preview',
      }),
    })
  })
```

> **Note:** The `realtimeToken()` function works with any server framework. The example above uses TanStack Start, but you can use Express, Hono, Fastify, or any other framework that can handle HTTP requests.

### 2. Connect from the Client (React)

```typescript
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
    getToken: () => fetch('/api/realtime-token', { method: 'POST' }).then(r => r.json()),
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

### OpenAI Realtime

OpenAI's realtime API uses WebRTC for low-latency voice communication.

**Server (token generation):**

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

const token = await realtimeToken({
  adapter: openaiRealtimeToken({
    model: 'gpt-4o-realtime-preview',
  }),
})
```

**Client (connection):**

```typescript
import { openaiRealtime } from '@tanstack/ai-openai'

const adapter = openaiRealtime()
```

**Environment variables:** `OPENAI_API_KEY`

**Available models:**

| Model | Description |
|-------|-------------|
| `gpt-4o-realtime-preview` | Full realtime model |
| `gpt-4o-mini-realtime-preview` | Smaller, faster realtime model |
| `gpt-realtime` | Latest realtime model |
| `gpt-realtime-mini` | Latest mini realtime model |

**Available voices:** `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`

### ElevenLabs Realtime

ElevenLabs uses WebSocket connections and requires an agent configured in their dashboard.

**Server (token generation):**

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: 'your-agent-id',
  }),
})
```

**Client (connection):**

```typescript
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const adapter = elevenlabsRealtime()
```

**Environment variables:** `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (optional)

## Voice Activity Detection (VAD)

VAD controls how the system detects when the user is speaking. Three modes are available:

| Mode | Description |
|------|-------------|
| `server` | Provider handles speech detection server-side (default) |
| `semantic` | Uses semantic understanding to detect turn boundaries (OpenAI only) |
| `manual` | Application controls when to listen via `startListening()`/`stopListening()` |

```typescript
const chat = useRealtimeChat({
  // ...
  vadMode: 'semantic',
  semanticEagerness: 'medium', // 'low' | 'medium' | 'high'
})
```

With `manual` VAD mode, use push-to-talk style interactions:

```typescript
const { startListening, stopListening } = useRealtimeChat({
  vadMode: 'manual',
  autoCapture: false,
  // ...
})

// In your UI
<button
  onPointerDown={startListening}
  onPointerUp={stopListening}
>
  Hold to talk
</button>
```

## Tools

Realtime sessions support client-side tools. Define tools using the standard `toolDefinition()` API and pass their client implementations:

```typescript
import { toolDefinition } from '@tanstack/ai'
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

// Pass tools to the hook
const chat = useRealtimeChat({
  // ...
  tools: [getWeather],
})
```

The realtime client automatically executes tool calls and sends results back to the provider. Tool calls appear as `tool-call` and `tool-result` parts in messages.

## Text and Image Input

In addition to voice, you can send text messages and images:

```typescript
const { sendText, sendImage } = useRealtimeChat({ /* ... */ })

// Send a text message
sendText('What is the weather like today?')

// Send an image (base64 data or URL)
sendImage(base64ImageData, 'image/png')
```

## Audio Visualization

The hook provides real-time audio level data for building visualizations:

```typescript
const {
  inputLevel,       // 0-1 normalized microphone volume
  outputLevel,      // 0-1 normalized speaker volume
  getInputFrequencyData,   // Uint8Array for frequency spectrum
  getOutputFrequencyData,
  getInputTimeDomainData,  // Uint8Array for waveform
  getOutputTimeDomainData,
} = useRealtimeChat({ /* ... */ })
```

The `inputLevel` and `outputLevel` values update on every animation frame while connected, making them suitable for driving CSS animations or canvas visualizations:

```typescript
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

For more detailed visualizations, use the frequency and time-domain data getters inside a `requestAnimationFrame` loop.

## Session Configuration

Configure the realtime session through the hook options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `getToken` | `() => Promise<RealtimeToken>` | required | Function to fetch a token from the server |
| `adapter` | `RealtimeAdapter` | required | Provider adapter (`openaiRealtime()`, `elevenlabsRealtime()`) |
| `instructions` | `string` | — | System instructions for the assistant |
| `voice` | `string` | — | Voice to use for audio output |
| `tools` | `AnyClientTool[]` | — | Client-side tools with execution logic |
| `vadMode` | `'server' \| 'semantic' \| 'manual'` | `'server'` | Voice activity detection mode |
| `semanticEagerness` | `'low' \| 'medium' \| 'high'` | — | Eagerness for semantic VAD |
| `autoPlayback` | `boolean` | `true` | Auto-play assistant audio |
| `autoCapture` | `boolean` | `true` | Request microphone on connect |
| `outputModalities` | `Array<'audio' \| 'text'>` | — | Response modalities |
| `temperature` | `number` | — | Generation temperature |
| `maxOutputTokens` | `number \| 'inf'` | — | Max tokens in a response |

## Connection Lifecycle

The realtime client manages a connection lifecycle with these statuses:

| Status | Description |
|--------|-------------|
| `idle` | Not connected |
| `connecting` | Establishing connection |
| `connected` | Active session |
| `reconnecting` | Reconnecting after interruption |
| `error` | Connection error occurred |

And these modes while connected:

| Mode | Description |
|------|-------------|
| `idle` | Connected but not actively interacting |
| `listening` | Capturing user audio input |
| `thinking` | Processing user input |
| `speaking` | AI is generating a response |

```typescript
const { status, mode, error, connect, disconnect } = useRealtimeChat({ /* ... */ })

// Handle connection
useEffect(() => {
  if (status === 'error' && error) {
    console.error('Connection error:', error.message)
  }
}, [status, error])
```

## Interruptions

Users can interrupt the AI while it's speaking:

```typescript
const { interrupt, mode } = useRealtimeChat({ /* ... */ })

// Programmatically interrupt
if (mode === 'speaking') {
  interrupt()
}
```

With server or semantic VAD, interruptions happen automatically when the user starts speaking. Interrupted messages are marked with `interrupted: true` in the messages array.

## Using RealtimeClient Directly

For non-React applications or more control, use `RealtimeClient` directly:

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { openaiRealtime } from '@tanstack/ai-openai'

const client = new RealtimeClient({
  getToken: () => fetch('/api/realtime-token', { method: 'POST' }).then(r => r.json()),
  adapter: openaiRealtime(),
  instructions: 'You are a helpful assistant.',
  voice: 'alloy',
  onMessage: (message) => {
    console.log(`${message.role}:`, message.parts)
  },
  onStatusChange: (status) => {
    console.log('Status:', status)
  },
  onModeChange: (mode) => {
    console.log('Mode:', mode)
  },
})

// Connect
await client.connect()

// Send text
client.sendText('Hello!')

// Subscribe to state changes
const unsub = client.onStateChange((state) => {
  console.log('Messages:', state.messages.length)
})

// Disconnect when done
await client.disconnect()

// Clean up
client.destroy()
```

## Message Structure

Realtime messages use a `parts`-based structure similar to `UIMessage`:

```typescript
interface RealtimeMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: number
  parts: Array<RealtimeMessagePart>
  interrupted?: boolean
}
```

Each part can be one of:

| Part Type | Fields | Description |
|-----------|--------|-------------|
| `text` | `content` | Text content from `sendText()` |
| `audio` | `transcript`, `durationMs` | Transcribed voice content |
| `tool-call` | `id`, `name`, `arguments`, `input`, `output` | Tool invocation |
| `tool-result` | `toolCallId`, `content` | Tool execution result |
| `image` | `data`, `mimeType` | Image sent via `sendImage()` |

## Error Handling

Handle errors through the `onError` callback or the `error` state:

```typescript
const { error } = useRealtimeChat({
  // ...
  onError: (err) => {
    if (err.message.includes('Permission denied')) {
      alert('Microphone access is required for voice chat.')
    } else {
      console.error('Realtime error:', err)
    }
  },
})
```

## Best Practices

1. **Token security** - Always generate tokens server-side. Never expose API keys to the client.
2. **Microphone permissions** - Handle the case where the user denies microphone access gracefully.
3. **Cleanup** - Always disconnect when unmounting components. The `useRealtimeChat` hook handles this automatically.
4. **Instructions** - Keep voice assistant instructions concise. Remind the model it's in a voice interface so responses stay conversational.
5. **Tool design** - Keep tool descriptions clear and tool outputs small, since results are processed in real time.
6. **Error recovery** - Implement retry logic for transient connection failures.

## Next Steps

- [Tools](./tools) - Learn about the isomorphic tool system
- [Text-to-Speech](./text-to-speech) - Non-realtime speech generation
- [Multimodal Content](./multimodal-content) - Working with images, audio, and video
