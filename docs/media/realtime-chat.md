---
title: Realtime Voice Chat
id: realtime-chat
order: 2
description: "Talk to a model with your voice and hear it answer. Mint a short-lived token on the server, then connect from the browser with useRealtimeChat."
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

Realtime voice opens a live audio connection between the browser and the model. The server mints a short-lived token. The API key stays on the server.

## Quick setup

This builds a voice chat with OpenAI in React. It takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env` on the server:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/realtime-token` that returns a token:

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

export async function POST() {
  const token = await realtimeToken({
    adapter: openaiRealtimeToken({ model: 'gpt-realtime-2.1' }),
  })
  return Response.json(token)
}
```

4. Connect from a component:

```tsx
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'

export function VoiceChat() {
  const {
    status,
    mode,
    messages,
    connect,
    disconnect,
    pendingUserTranscript,
    pendingAssistantTranscript,
  } = useRealtimeChat({
    getToken: () =>
      fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
    adapter: openaiRealtime(),
    instructions: 'You are a helpful voice assistant. Keep answers short.',
    voice: 'alloy',
  })

  return (
    <div>
      <p>
        Status: {status}. Mode: {mode}.
      </p>
      <button onClick={status === 'idle' ? connect : disconnect}>
        {status === 'idle' ? 'Start conversation' : 'End conversation'}
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

Click **Start conversation** and allow the microphone. Say something. The model answers out loud, and the transcript shows up below the button.

## How it works

The chat has two halves:

- **The server** calls `realtimeToken()` with a token adapter, such as `openaiRealtimeToken()`. The provider returns a short-lived token. Your API key stays on the server.
- **The browser** calls `useRealtimeChat()` with a connection adapter, such as `openaiRealtime()`. The hook fetches a token with `getToken`, opens the microphone, and connects straight to the provider over WebRTC or WebSocket.

After you connect, the provider listens to the user. When the user stops talking, the model answers with voice. If the user talks while the model speaks, the model stops. The hook keeps a transcript in `messages`.

This is a live conversation, not a [generation](./generations). For one clip of speech from text, use [Text-to-Speech](./text-to-speech).

## Providers

Every provider uses the same hook. Swap the token adapter on the server and the connection adapter in the browser.

| Provider | Server token | Browser adapter | Key | Transport |
| --- | --- | --- | --- | --- |
| OpenAI | `openaiRealtimeToken()` | `openaiRealtime()` | `OPENAI_API_KEY` | WebRTC (default) or WebSocket |
| Gemini | `geminiRealtimeToken()` | `geminiRealtime()` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | WebSocket |
| Grok | `grokRealtimeToken()` | `grokRealtime()` | `XAI_API_KEY` | WebRTC (default) or WebSocket |
| ElevenLabs | `elevenlabsRealtimeToken()` | `elevenlabsRealtime()` | `ELEVENLABS_API_KEY` | WebSocket or WebRTC (detected by default) |

To pick the transport, pass `connectionMode` to the browser adapter, for example `openaiRealtime({ connectionMode: 'websocket' })`.

### OpenAI

Pass the model to the token adapter. The default is `gpt-realtime-2.1`.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

const token = await realtimeToken({
  adapter: openaiRealtimeToken({ model: 'gpt-realtime-2.1-mini' }),
})
```

| Model | Description |
| --- | --- |
| `gpt-realtime-2.1` | Newest full model (default) |
| `gpt-realtime-2.1-mini` | Newest smaller, faster model |
| `gpt-realtime-2` | Full model |
| `gpt-realtime-1.5` | Full model |
| `gpt-realtime` | Full model |
| `gpt-realtime-mini` | Smaller, faster model |

Voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`.

### Gemini

Pass the model to the browser adapter. The default is `gemini-3.8-live`.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { geminiRealtimeToken } from '@tanstack/ai-gemini'

const token = await realtimeToken({ adapter: geminiRealtimeToken() })
```

```typescript
import { geminiRealtime } from '@tanstack/ai-gemini'

const adapter = geminiRealtime({ model: 'gemini-3.8-live' })
```

Models:

- `gemini-3.8-live`: the default low-latency voice model.
- `gemini-3.8-live-extended-thinking`: thinks in the background while it speaks.
- `gemini-3.1-flash-live-preview`: preview model.

The token is good for one connection and 30 minutes by default. Change this with `uses` and `expiresAt`. See the [Gemini adapter](../adapters/gemini) for voices and Live options.

### Grok

The default model is `grok-voice-think-fast-2.0`. `grok-voice-latest` always points to the newest model.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { grokRealtimeToken } from '@tanstack/ai-grok'

const token = await realtimeToken({
  adapter: grokRealtimeToken({ model: 'grok-voice-think-fast-2.0' }),
})
```

In the browser, use `grokRealtime()`. See the [Grok adapter](../adapters/grok).

### ElevenLabs

ElevenLabs runs an agent that you create in the ElevenLabs dashboard. The agent holds the voice and the system prompt.

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({ agentId: 'your-agent-id' }),
})
```

If you leave out `agentId`, the adapter reads `ELEVENLABS_AGENT_ID`. To change the voice, the system prompt, the first message, or the language for one session, pass `overrides`. In the browser, use `elevenlabsRealtime()`:

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'

export function ElevenLabsChat() {
  const { status, connect } = useRealtimeChat({
    getToken: () => fetch('/api/elevenlabs-token').then((r) => r.json()),
    adapter: elevenlabsRealtime(),
  })
  // Render the same way as in the quick setup.
}
```

See the [ElevenLabs adapter](../adapters/elevenlabs) for the agent setup.

### Other frameworks

- **Octane**: `useRealtimeChat` from `@tanstack/ai-octane`.
- **Remix**: `createRealtimeChat(handle, options)` from `@tanstack/ai-remix`. See the [Remix API](../api/ai-remix).
- **Vue, Solid, Svelte, Angular, and plain TypeScript**: use `RealtimeClient` from `@tanstack/ai-client`. See [Use RealtimeClient directly](#use-realtimeclient-directly).

## Turn detection

Voice Activity Detection (VAD) decides when the user starts and stops talking. Set it with `vadMode`:

| Mode | How it works | Use it for |
| --- | --- | --- |
| `server` | The provider detects speech from the audio level. This is the default. | Most apps |
| `semantic` | The provider detects the end of a sentence from pauses and meaning. | Natural talk that does not cut the user off |
| `manual` | You call `startListening()` and `stopListening()`. | Push-to-talk |

A push-to-talk button:

```tsx
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

export function PushToTalk() {
  const { startListening, stopListening } = useRealtimeChat({
    getToken,
    adapter: openaiRealtime(),
    vadMode: 'manual',
  })

  return (
    <button onMouseDown={startListening} onMouseUp={stopListening}>
      Hold to talk
    </button>
  )
}
```

With `semantic`, `semanticEagerness` sets how long the model waits before it decides the user is done. `'low'` waits the longest.

To change the mode without a reconnect, call `updateSession({ vadMode: 'semantic' })`.

## Tools

The model can call client tools during the conversation. Define them with `toolDefinition()` and pass the `.client()` implementations to `tools`:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { z } from 'zod'
import { getToken } from './token'

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

export function useWeatherVoiceChat() {
  return useRealtimeChat({
    getToken,
    adapter: openaiRealtime(),
    tools: [getWeather],
  })
}
```

The client runs each tool call and sends the result back to the provider. The calls show up as `tool-call` and `tool-result` parts in `messages`. Keep tool output small, because the model reads it while the conversation runs. For more on tools, see [Tools](../tools/tools).

## Text and images

The user can also type, or send a picture:

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'
import { base64ImageData } from './assets'

export function useAskAboutPhoto() {
  const { sendText, sendImage } = useRealtimeChat({
    getToken,
    adapter: openaiRealtime(),
  })

  return () => {
    sendImage(base64ImageData, 'image/png')
    sendText('What is in this photo?')
  }
}
```

`sendImage` takes base64 data or a URL, and a MIME type.

## Interruptions

With `server` or `semantic` VAD, the model stops when the user starts to talk. To stop it from code, call `interrupt()`:

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

export function useStopButton() {
  const { interrupt, mode } = useRealtimeChat({
    getToken,
    adapter: openaiRealtime(),
  })
  return () => {
    if (mode === 'speaking') interrupt()
  }
}
```

An interrupted message has `interrupted: true`.

You now have a voice chat that listens, answers, calls tools, and stops when the user cuts in.

## Advanced

### Hook options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `getToken` | `() => Promise<RealtimeToken>` | required | Fetches a token from your server |
| `adapter` | `RealtimeAdapter` | required | The browser adapter, for example `openaiRealtime()` |
| `instructions` | `string` | - | System instructions for the assistant |
| `voice` | `string` | - | The voice for audio output |
| `tools` | `ReadonlyArray<AnyClientTool>` | - | Client tools with their implementations |
| `vadMode` | `'server' \| 'semantic' \| 'manual'` | `'server'` | Turn detection mode |
| `semanticEagerness` | `'low' \| 'medium' \| 'high'` | - | How fast semantic VAD ends a turn |
| `autoPlayback` | `boolean` | `true` | Play the assistant audio |
| `autoCapture` | `boolean` | `true` | Ask for the microphone on connect |
| `outputModalities` | `Array<'audio' \| 'text'>` | - | What the model answers with |
| `temperature` | `number` | - | Generation temperature |
| `maxOutputTokens` | `number \| 'inf'` | - | Maximum tokens in one answer |

Callbacks:

| Callback | Called when |
| --- | --- |
| `onConnect`, `onDisconnect` | The session opens or closes |
| `onStatusChange(status)`, `onModeChange(mode)` | The status or the mode changes |
| `onMessage(message)` | A message is complete |
| `onInterrupted()` | The user interrupts the model |
| `onError(error)` | Something fails |
| `onUsage(usage)` | The provider reports usage |
| `onGoAway(timeLeft?)` | The provider is about to close the session |

`updateSession(config)` changes the session config while connected. It accepts `voice`, `instructions`, `vadMode`, and the other session fields, plus `providerOptions` for provider-specific settings.

### Status and mode

`status` is the connection:

| Status | Description |
| --- | --- |
| `idle` | Not connected |
| `connecting` | The connection is opening |
| `connected` | The session is active |
| `reconnecting` | The connection dropped and is coming back |
| `error` | The connection failed |

`mode` is what the conversation does while connected:

| Mode | Description |
| --- | --- |
| `idle` | Connected, nothing happens |
| `listening` | The microphone captures the user |
| `thinking` | The model works on the input |
| `speaking` | The model answers |

### Message structure

Realtime messages hold a list of parts:

```typescript
import type { RealtimeMessagePart } from '@tanstack/ai'

interface RealtimeMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: number
  parts: Array<RealtimeMessagePart>
  interrupted?: boolean
}
```

| Part type | Fields | Description |
| --- | --- | --- |
| `text` | `content` | Text from `sendText()` |
| `audio` | `transcript`, `durationMs` | A spoken turn and its transcript |
| `tool-call` | `id`, `name`, `arguments`, `input`, `output` | A tool call |
| `tool-result` | `toolCallId`, `content` | A tool result |
| `image` | `data`, `mimeType` | An image from `sendImage()` |

### Errors

Read `error` (an `Error` or `null`), or pass `onError`. A denied microphone is the most common error:

```typescript
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime } from '@tanstack/ai-openai'
import { getToken } from './token'

export function useVoiceChatWithErrors() {
  return useRealtimeChat({
    getToken,
    adapter: openaiRealtime(),
    onError: (err: Error) => {
      if (err.message.includes('Permission denied')) {
        alert('Voice chat needs the microphone.')
      } else {
        console.error('Realtime error:', err)
      }
    },
  })
}
```

For short network failures, add your own retry logic that calls `connect()` again.

### Audio visualization

The hook gives you audio data for level meters, waveforms, and spectrum views:

- `inputLevel` and `outputLevel`: the microphone and speaker levels, from 0 to 1. They update on every animation frame while connected.
- `getInputFrequencyData()` and `getOutputFrequencyData()`: FFT bins as a `Uint8Array`, for a spectrum view.
- `getInputTimeDomainData()` and `getOutputTimeDomainData()`: waveform samples as a `Uint8Array`.

A pulsing indicator driven by a level:

```tsx
export function AudioIndicator({ level }: { level: number }) {
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

A spectrum view on a canvas:

```typescript
export function drawSpectrum(
  canvas: HTMLCanvasElement,
  getInputFrequencyData: () => Uint8Array,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const draw = () => {
    const data = getInputFrequencyData()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const barWidth = canvas.width / data.length
    data.forEach((value, i) => {
      const height = (value / 255) * canvas.height
      ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 1, height)
    })
    requestAnimationFrame(draw)
  }
  draw()
}
```

### Use RealtimeClient directly

Without React, or for full control, use `RealtimeClient`. It takes the same options and callbacks as the hook:

```typescript
import { RealtimeClient } from '@tanstack/ai-client'
import { openaiRealtime } from '@tanstack/ai-openai'

const client = new RealtimeClient({
  getToken: () =>
    fetch('/api/realtime-token', { method: 'POST' }).then((r) => r.json()),
  adapter: openaiRealtime(),
  instructions: 'You are a helpful assistant.',
  voice: 'alloy',
  onMessage: (message) => console.log(`${message.role}:`, message.parts),
  onStatusChange: (status) => console.log('Status:', status),
  onModeChange: (mode) => console.log('Mode:', mode),
})

await client.connect()
client.sendText('Hello!')

const unsubscribe = client.onStateChange((state) => {
  console.log('Messages:', state.messages.length)
})

// When you are done:
unsubscribe()
await client.disconnect()
client.destroy()
```

The React hook disconnects by itself when the component unmounts. With `RealtimeClient`, call `disconnect()` and `destroy()` yourself.

### Tips

- Mint tokens only on the server. Never send an API key to the browser.
- Tell the model in `instructions` that it talks through voice. Then its answers stay short and spoken.
- Keep tool descriptions clear and tool output small.
