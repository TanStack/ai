---
title: ElevenLabs
id: elevenlabs-adapter
order: 9
description: "Build realtime voice-to-voice conversational AI with ElevenLabs agents in TanStack AI via the @tanstack/ai-elevenlabs adapter."
keywords:
  - tanstack ai
  - elevenlabs
  - realtime voice ai
  - conversational ai
  - voice chat
  - voice agents
  - adapter
---

The ElevenLabs adapter provides realtime conversational voice AI for TanStack AI. Unlike text-focused adapters, the ElevenLabs adapter is **voice-focused** -- it integrates with TanStack AI's realtime system to enable voice-to-voice conversations. It does not support `chat()`, `embedding()`, or `summarize()`.

ElevenLabs uses an **agent-based architecture** where you configure your conversational AI agent in the [ElevenLabs dashboard](https://elevenlabs.io/) (voice, personality, knowledge base, tools) and then connect to it at runtime. The adapter wraps the `@11labs/client` SDK for seamless integration with `useRealtimeChat` and `RealtimeClient`.

## Installation

```bash
npm install @tanstack/ai-elevenlabs
```

Peer dependencies:

```bash
npm install @tanstack/ai @tanstack/ai-client
```

## Server Setup

The server generates a **signed WebSocket URL** so your API key never reaches the client. The signed URL is valid for 30 minutes.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

// In your API route (Express, Hono, TanStack Start, etc.)
export async function POST() {
  const token = await realtimeToken({
    adapter: elevenlabsRealtimeToken({
      agentId: process.env.ELEVENLABS_AGENT_ID!,
    }),
  })

  return Response.json(token)
}
```

### With Overrides

You can override agent settings at token generation time without changing your dashboard configuration:

```typescript
const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: process.env.ELEVENLABS_AGENT_ID!,
    overrides: {
      voiceId: 'custom-voice-id',
      systemPrompt: 'You are a helpful voice assistant.',
      firstMessage: 'Hello! How can I help you today?',
      language: 'en',
    },
  }),
})
```

## Client Setup

### React (useRealtimeChat)

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

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
    adapter: elevenlabsRealtime(),
  })

  return (
    <div>
      <p>Status: {status}</p>
      <p>Mode: {mode}</p>
      <button onClick={status === 'idle' ? connect : disconnect}>
        {status === 'idle' ? 'Start Conversation' : 'End Conversation'}
      </button>
      {pendingUserTranscript && <p>You: {pendingUserTranscript}...</p>}
      {pendingAssistantTranscript && (
        <p>AI: {pendingAssistantTranscript}...</p>
      )}
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

### Non-React (RealtimeClient)

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const client = new RealtimeClient({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
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

await client.connect()
```

## Client Tools

ElevenLabs supports client-side tools that execute in the browser. Define tools using the standard `toolDefinition()` API:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeatherDef = toolDefinition({
  name: 'getWeather',
  description: 'Get weather for a location',
  inputSchema: z.object({
    location: z.string(),
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
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
  tools: [getWeather],
})
```

Tool results are automatically serialized to strings and returned to the ElevenLabs agent. The adapter converts TanStack tool definitions into the `@11labs/client` clientTools format internally.

## Configuration

### `elevenlabsRealtimeToken` Options

Used on the **server** to generate a signed WebSocket URL.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `agentId` | `string` | Yes | Agent ID configured in the ElevenLabs dashboard |
| `overrides.voiceId` | `string` | No | Custom voice ID to override the agent's default voice |
| `overrides.systemPrompt` | `string` | No | Custom system prompt to override the agent's default |
| `overrides.firstMessage` | `string` | No | First message the agent speaks when the session starts |
| `overrides.language` | `string` | No | Language code (e.g., `'en'`, `'es'`, `'fr'`) |

### `elevenlabsRealtime` Options

Used on the **client** to establish the connection.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connectionMode` | `'websocket' \| 'webrtc'` | auto-detect | Transport protocol for the connection |
| `debug` | `boolean` | `false` | Enable debug logging |

## Differences from OpenAI Realtime

ElevenLabs and OpenAI take different approaches to realtime voice:

| | ElevenLabs | OpenAI |
|---|---|---|
| **Configuration** | Agent-based. Configure voice, personality, and knowledge in the ElevenLabs dashboard or via `overrides` at token time. | Session-based. Configure `instructions`, `voice`, `temperature`, etc. per session via `useRealtimeChat` options. |
| **Token type** | Signed WebSocket URL (valid 30 minutes) | Ephemeral API token (valid ~10 minutes) |
| **Transport** | WebSocket (default) or WebRTC | WebRTC |
| **Audio handling** | `@11labs/client` SDK manages audio capture and playback automatically | TanStack AI manages WebRTC peer connection and audio tracks |
| **VAD** | Handled by ElevenLabs server-side | Supports `server`, `semantic`, and `manual` modes |
| **Runtime updates** | Session config is set at creation time and cannot be changed mid-session | Supports `updateSession()` for mid-session config changes |
| **Image input** | Not supported | Supported via `sendImage()` |
| **Time domain data** | Not available from the SDK | Available for waveform visualizations |

## Audio Visualization

The ElevenLabs adapter provides audio visualization data through the same interface as other realtime adapters:

```typescript
const {
  inputLevel, // 0-1 normalized microphone volume
  outputLevel, // 0-1 normalized speaker volume
  getInputFrequencyData, // Uint8Array frequency spectrum
  getOutputFrequencyData,
} = useRealtimeChat({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
})
```

**Note:** ElevenLabs provides volume levels and frequency data but does not expose time-domain data. The `getInputTimeDomainData()` and `getOutputTimeDomainData()` methods return static placeholder arrays. The default audio sample rate is 16kHz.

## Environment Variables

Set these in your server environment:

```bash
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_AGENT_ID=your-agent-id
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | Your ElevenLabs API key, used server-side for generating signed URLs |
| `ELEVENLABS_AGENT_ID` | No | Default agent ID. Can also be passed directly to `elevenlabsRealtimeToken()` |

Get your API key from the [ElevenLabs dashboard](https://elevenlabs.io/). Create and configure agents in the **Conversational AI** section of the dashboard.

## API Reference

### `elevenlabsRealtimeToken(options)`

Creates an ElevenLabs realtime token adapter for server-side use with `realtimeToken()`.

**Parameters:**

- `options.agentId` - Agent ID from the ElevenLabs dashboard
- `options.overrides?.voiceId` - Custom voice ID
- `options.overrides?.systemPrompt` - Custom system prompt
- `options.overrides?.firstMessage` - First message the agent speaks
- `options.overrides?.language` - Language code

**Returns:** A `RealtimeTokenAdapter` for use with `realtimeToken()`.

### `elevenlabsRealtime(options?)`

Creates an ElevenLabs realtime client adapter for use with `useRealtimeChat` or `RealtimeClient`.

**Parameters:**

- `options.connectionMode?` - `'websocket'` or `'webrtc'` (default: auto-detect)
- `options.debug?` - Enable debug logging

**Returns:** A `RealtimeAdapter` for use with `useRealtimeChat()` or `RealtimeClient`.

## Limitations

- **No text chat support** -- Use OpenAI, Anthropic, Gemini, or another text adapter for `chat()`
- **No embeddings or summarization** -- Use a text adapter for `embedding()` or `summarize()`
- **No image input** -- ElevenLabs realtime does not support sending images during a conversation
- **No runtime session updates** -- Session configuration is fixed at connection time
- **No time-domain audio data** -- Frequency data and volume levels are available, but waveform data is not
- **Agent required** -- You must create and configure an agent in the ElevenLabs dashboard before using this adapter

## Next Steps

- [Realtime Voice Chat Guide](../media/realtime-chat) - Complete guide to building realtime voice applications
- [OpenAI Adapter](./openai) - Alternative realtime voice provider with WebRTC
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
