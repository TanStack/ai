---
title: ElevenLabs
id: elevenlabs-adapter
order: 9
description: "ElevenLabs voice agents, TTS, music/SFX, and transcription via @tanstack/ai-elevenlabs."
keywords:
  - tanstack ai
  - elevenlabs
  - realtime voice ai
  - conversational ai
  - voice chat
  - voice agents
  - adapter
---

If you need ElevenLabs voice → install, configure an agent, issue a token on the server, connect on the client.

**Has:** realtime agents, TTS, music/SFX, transcription.  
**Does not:** `chat()`, `summarize()` — use a text adapter.

## Install

```bash
npm install @tanstack/ai-elevenlabs
```

```bash
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_AGENT_ID=your-agent-id   # optional if passed to token factory
```

Create agents in the [ElevenLabs dashboard](https://elevenlabs.io/) (Conversational AI).

## Realtime: do this

### 1. Server — signed URL (30 min)

```typescript group=elevenlabs-1
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

export async function POST() {
  const token = await realtimeToken({
    adapter: elevenlabsRealtimeToken({
      agentId: process.env.ELEVENLABS_AGENT_ID!,
    }),
  })

  return Response.json(token)
}
```

Optional overrides at token time:

```typescript group=elevenlabs-1
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

### 2. Client — React

```tsx
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

### Non-React

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

### Client tools

```typescript
import { toolDefinition } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'
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

const chat = useRealtimeChat({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
  tools: [getWeather],
})
```

## Configuration

### `elevenlabsRealtimeToken` (server)

| Option | Required | Description |
|--------|----------|-------------|
| `agentId` | if env unset | Dashboard agent id (`ELEVENLABS_AGENT_ID` fallback) |
| `overrides.voiceId` | no | Override voice |
| `overrides.systemPrompt` | no | Override system prompt |
| `overrides.firstMessage` | no | First spoken line |
| `overrides.language` | no | e.g. `'en'`, `'es'` |

### `elevenlabsRealtime` (client)

| Option | Default | Description |
|--------|---------|-------------|
| `connectionMode` | auto | `'websocket'` \| `'webrtc'` |
| `debug` | `false` | Logging |

## vs OpenAI Realtime

| | ElevenLabs | OpenAI |
|---|---|---|
| Config | Dashboard agent + token overrides | Per-session options |
| Token | Signed WS URL (30 min) | Ephemeral (~10 min) |
| Transport | WS (default) or WebRTC | WebRTC |
| Mid-session updates | No | `updateSession()` |
| Image input | No | `sendImage()` |
| Time-domain audio | No (freq + volume only) | Yes |

## Audio visualization

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

const {
  inputLevel,
  outputLevel,
  getInputFrequencyData,
  getOutputFrequencyData,
} = useRealtimeChat({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
})
```

`getInputTimeDomainData()` / `getOutputTimeDomainData()` return placeholders. Sample rate default 16kHz.

## Text-to-speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { elevenlabsSpeech } from "@tanstack/ai-elevenlabs";

const result = await generateSpeech({
  adapter: elevenlabsSpeech("eleven_v3"),
  text: "Hello from ElevenLabs!",
  voice: "Rachel",
  format: "mp3",
});

console.log(result.audio);
```

## Music & sound effects

```typescript
import { generateAudio } from "@tanstack/ai";
import { elevenlabsAudio } from "@tanstack/ai-elevenlabs";

const music = await generateAudio({
  adapter: elevenlabsAudio("music_v1"),
  prompt: "An upbeat synthwave track for a product launch",
});

const sfx = await generateAudio({
  adapter: elevenlabsAudio("eleven_text_to_sound_v2"),
  prompt: "A glass shattering on concrete",
});
```

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { elevenlabsTranscription } from "@tanstack/ai-elevenlabs";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: elevenlabsTranscription("scribe_v1"),
  audio: audioFile,
});

console.log(result.text);
```

## API reference

| Factory | Use with |
| --- | --- |
| `elevenlabsRealtimeToken` | `realtimeToken()` |
| `elevenlabsRealtime` | `useRealtimeChat` / `RealtimeClient` |
| `elevenlabsSpeech` / `createElevenLabsSpeech` | `generateSpeech()` |
| `elevenlabsAudio` / `createElevenLabsAudio` | `generateAudio()` |
| `elevenlabsTranscription` / `createElevenLabsTranscription` | `generateTranscription()` |

## Notes

- No text chat / summarization
- Realtime: agent required; no image input; no mid-session config; no time-domain audio

## Next steps

- [Realtime Voice Chat](../media/realtime-chat)
- [OpenAI Adapter](./openai)
- [Tools](../tools/tools)
