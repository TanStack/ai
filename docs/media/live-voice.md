---
title: GPT-Live Voice
id: live-voice
order: 2.5
description: "Talk to OpenAI gpt-live-1.1 from the browser with full-duplex voice. Relay the WebRTC offer through your server with realtimeSession(), then connect with useRealtimeChat and createSession."
keywords:
  - tanstack ai
  - gpt-live
  - gpt-live-1.1
  - openai live
  - realtime voice
  - full duplex
  - webrtc
  - realtimeSession
  - useRealtimeChat
---

`openaiLive()` connects the browser to OpenAI `gpt-live-1.1` for full-duplex voice. The user and the model can talk at the same time. GPT-Live has no browser token, so your server relays the connection with `realtimeSession()`.

The hook is the same `useRealtimeChat` as in [Realtime Voice Chat](./realtime-chat). You give it `createSession` in place of `getToken`.

## Quick setup

This builds a GPT-Live voice chat in React. It takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env` on the server:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/live-session` that relays the session:

```typescript
import { realtimeSession } from '@tanstack/ai'
import { openaiLiveSession } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const answer = await realtimeSession({
    adapter: openaiLiveSession({ model: 'gpt-live-1.1' }),
    request: await request.json(),
    abortSignal: request.signal,
  })
  return Response.json(answer)
}
```

4. Connect from a component:

```tsx
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiLive } from '@tanstack/ai-openai'
import type { RealtimeSessionRequest } from '@tanstack/ai'

function createSession(request: RealtimeSessionRequest) {
  return fetch('/api/live-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }).then((r) => r.json())
}

export function LiveVoiceChat() {
  const {
    status,
    mode,
    messages,
    connect,
    disconnect,
    pendingUserTranscript,
    pendingAssistantTranscript,
  } = useRealtimeChat({
    createSession,
    adapter: openaiLive(),
    instructions: 'You are a helpful voice assistant. Keep answers short.',
    voice: 'marin',
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
            <span key={i}>{part.type === 'audio' ? part.transcript : null}</span>
          ))}
        </div>
      ))}
    </div>
  )
}
```

Click **Start conversation** and allow the microphone. Talk to the model. It answers out loud, and you can talk over it at any time.

## How it works

The connection has three steps:

1. The browser makes a WebRTC offer. `createSession` sends the offer and the hook config to your route.
2. Your route calls `realtimeSession()`. `openaiLiveSession()` sends the offer to OpenAI with your API key and gets the answer.
3. The browser gets the answer and connects straight to OpenAI. The audio does not go through your server.

`realtimeSession()` checks the request body before it calls the adapter. The body must have a non-empty `sdp` string and a `config` object. Other keys are dropped, so you can pass `await request.json()` directly.

## Server options

The server options win over the browser config. Set them in `openaiLiveSession()`:

```typescript
import { openaiLiveSession } from '@tanstack/ai-openai'

const adapter = openaiLiveSession({
  model: 'gpt-live-1.1',
  instructions: 'You are a support agent for Acme. Keep answers short.',
  voice: 'marin',
  delegation: { model: 'gpt-6.1-terra' },
})
```

| Option | Default | Description |
| --- | --- | --- |
| `model` | `'gpt-live-1.1'` | `'gpt-live-1'` or `'gpt-live-1.1'`. Server only. |
| `instructions` | the client value | Replaces the `instructions` from the hook. |
| `voice` | the client value | Replaces the `voice` from the hook. If neither sets it, OpenAI uses `marin`. |
| `delegation` | none | The Responses model that runs tools, and its settings. `delegation.model` is server only. See [Tools](#tools). |
| `store` | OpenAI default | Lets OpenAI store the session. |
| `apiKey` | `OPENAI_API_KEY` | The OpenAI API key. |
| `baseURL` | `https://api.openai.com/v1` | The API base URL. |

The server reads only `instructions`, `voice`, and `tools` from the browser config. The other hook options, such as `vadMode` and `temperature`, have no effect on GPT-Live.

Voices: `marin`, `quartz`, `ripple`, `vesper`, `willow`, `stone`, `gleam`, `meridian`, `bossa`, `tempo`, `beacon`, `delta`, `cinder`, `nuri`, `juni`, `flitz`, `brise`, `sillage`, `nira`, `harema`, `shida`, `noeul`.

## Tools

GPT-Live gives tool work to a Responses model. That model calls your client tools. The browser runs each tool and sends the result back.

1. Set `delegation` on the server:

```typescript
import { realtimeSession } from '@tanstack/ai'
import { openaiLiveSession } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const answer = await realtimeSession({
    adapter: openaiLiveSession({
      delegation: { model: 'gpt-6.1-terra' },
    }),
    request: await request.json(),
    abortSignal: request.signal,
  })
  return Response.json(answer)
}
```

2. Pass the `.client()` tools to the hook in your chat component:

```tsx
import { toolDefinition } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiLive } from '@tanstack/ai-openai'
import { z } from 'zod'
import { createSession } from './create-session'

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

export function WeatherLiveChat() {
  const { status, connect, disconnect, updateSession } = useRealtimeChat({
    createSession,
    adapter: openaiLive(),
    tools: [getWeather],
  })

  function switchToMetric() {
    updateSession({
      providerOptions: {
        delegation: {
          instructions: 'Use metric units.',
          maxOutputTokens: 500,
        },
      },
    })
  }

  return (
    <div>
      <button onClick={status === 'idle' ? connect : disconnect}>
        {status === 'idle' ? 'Start conversation' : 'End conversation'}
      </button>
      <button onClick={switchToMetric} disabled={status !== 'connected'}>
        Use metric units
      </button>
    </div>
  )
}
```

If the browser sends tools and the server has no `delegation`, `realtimeSession()` rejects. No session starts.

3. To change the delegation settings while connected, call `updateSession` from the same `useRealtimeChat` call. The **Use metric units** button above does this. `updateSession` changes these `delegation` fields:

- `instructions`: the instructions for the delegated model.
- `toolChoice`: how the delegated model picks tools.
- `parallelToolCalls`: lets the delegated model call more than one tool in one turn.
- `maxOutputTokens`: the output limit for the delegated model (16 or more).

The delegation `model` stays on the server. If you send `delegation.model` to `updateSession`, the adapter drops it and logs an error.

## Differences from other realtime models

GPT-Live does not support these hook functions:

- `sendText()` and `sendImage()`: GPT-Live has no text or image input. The calls log an error and do nothing.
- `updateSession()`: it changes only `providerOptions.delegation`, and not `delegation.model`. It logs an error for the other fields.

These functions work in a different way:

- `interrupt()`: it changes only the local state. The model hears the user and stops by itself.
- `messages`: a message is complete when the other person starts to talk.
- `onUsage`: the token counts are 0. `billed` holds the audio seconds.

You now have a full-duplex voice chat. The user can talk over the model, and the model can call your tools.

## Other frameworks

Each framework takes the same `createSession` option:

- **Octane**: `useRealtimeChat` from `@tanstack/ai-octane`.
- **Remix**: `createRealtimeChat(handle, options)` from `@tanstack/ai-remix`. See the [Remix API](../api/ai-remix).
- **Preact, Solid, Vue, Svelte, and Angular**: `RealtimeClient` from your framework package, for example `@tanstack/ai-vue`.
- **Plain TypeScript**: `RealtimeClient` from `@tanstack/ai-client`.

A `RealtimeClient` with GPT-Live:

```typescript
import { RealtimeClient } from '@tanstack/ai-vue'
import { openaiLive } from '@tanstack/ai-openai'

const client = new RealtimeClient({
  adapter: openaiLive(),
  createSession: (request) =>
    fetch('/api/live-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }).then((r) => r.json()),
  instructions: 'You are a helpful voice assistant.',
  onMessage: (message) => console.log(`${message.role}:`, message.parts),
  onStatusChange: (status) => console.log('Status:', status),
})

await client.connect()

// When you are done:
await client.disconnect()
client.destroy()
```

Use the server route from the [quick setup](#quick-setup) for every framework.

## Build a relay adapter

A relay adapter connects to a provider through your server. Use one for a provider that has no browser token. It has a server half and a browser half.

1. On the server, write a `RealtimeSessionAdapter`. It gets the browser offer and returns the provider answer:

```typescript
import type { RealtimeSessionAdapter } from '@tanstack/ai'

export function myProviderSession(): RealtimeSessionAdapter {
  const apiKey = process.env.MY_PROVIDER_API_KEY
  return {
    provider: 'my-provider',
    async createSession(request, options) {
      const response = await fetch('https://api.example.com/v1/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/sdp',
        },
        body: request.sdp,
        signal: options?.abortSignal ?? null,
      })
      if (!response.ok) {
        throw new Error(`Session failed: ${response.status}`)
      }
      const sessionId = response.headers.get('x-session-id')
      if (!sessionId) throw new Error('The response has no session id')
      return {
        provider: 'my-provider',
        sessionId,
        sdp: await response.text(),
        config: request.config,
      }
    },
  }
}
```

2. Give it to `realtimeSession()` in your route, the same as `openaiLiveSession()`.

3. In the browser, write a `RealtimeRelayAdapter` with `kind: 'relay'`. `connect` makes the offer and calls `createSession`:

```typescript
import type { RealtimeRelayAdapter } from '@tanstack/ai'
import { createMyConnection } from './my-connection'

export function myProviderLive(): RealtimeRelayAdapter {
  return {
    provider: 'my-provider',
    kind: 'relay',
    async connect(createSession, clientTools, options) {
      const peer = new RTCPeerConnection()
      let mic: MediaStream | null = null
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        mic = stream
        stream.getTracks().forEach((track) => peer.addTrack(track, stream))
        const events = peer.createDataChannel('events')
        // The track event can fire before setRemoteDescription() returns.
        const speaker = new Audio()
        speaker.autoplay = true
        peer.ontrack = (event) => {
          speaker.srcObject = event.streams[0] ?? null
        }

        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        if (!offer.sdp) throw new Error('The offer has no SDP')
        options?.abortSignal?.throwIfAborted()

        const answer = await createSession({ sdp: offer.sdp })
        await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
        return createMyConnection({
          peer,
          mic: stream,
          speaker,
          events,
          clientTools,
        })
      } catch (error) {
        mic?.getTracks().forEach((track) => track.stop())
        peer.close()
        throw error
      }
    },
  }
}
```

Set `peer.ontrack` before `setRemoteDescription()`. The browser can fire the `track` event before that call returns, and a later handler misses the audio of the model.

If a step fails, for example `createSession` rejects, the `catch` stops each microphone track and closes the peer. Then it throws the error again.

`createMyConnection` returns a `RealtimeConnection`. From then on, the connection owns the microphone and the peer. It maps the provider events to the realtime events, and it stops the microphone on `disconnect()`. For a full example, read the source of `openaiLive()` in `@tanstack/ai-openai`.

Pass the adapter to `useRealtimeChat` with `createSession`. The hook sees `kind: 'relay'` and sends the offer and the config through your route.
