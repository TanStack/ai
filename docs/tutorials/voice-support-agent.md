---
title: Voice Support Agent
id: voice-support-agent
order: 10
description: "Build a phone support agent in a TanStack Start app. transcriptionSession() hears the caller, chat() answers from the docs with a tool, and generateSpeech() speaks each sentence as it lands."
keywords:
  - tanstack ai
  - tutorial
  - voice agent
  - call centre
  - telephony
  - twilio
  - transcriptionSession
  - generateSpeech
  - barge-in
---

This tutorial builds a support agent you talk to. You speak, the agent answers from the TanStack AI docs, and you hear the reply about one second later. At the end you point a Twilio number at it.

One OpenAI key covers speech-to-text, the chat model, and text-to-speech. It takes about 25 minutes.

This tutorial uses React and TanStack Start. The server half runs on Node. For the audio-in half alone, open [Live Transcription](../media/live-transcription).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. Install the TanStack AI packages and the WebSocket server:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-openai ws zod

<!-- ::end:tabs -->

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: @types/ws

<!-- ::end:tabs -->

Put your key in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## 2. Decide what runs where

A call has two sides:

- **The browser** opens the microphone, sends 24 kHz PCM up a WebSocket, and plays the PCM that comes back.
- **The server** owns the call. It transcribes, thinks, and speaks. Nothing about the model or the docs reaches the browser.

Start server routes answer HTTP requests. A call needs a socket that stays open, so the server half lives in a small Vite plugin instead of a route.

## 3. Define a carrier

Create `src/server/carriers.ts`. A carrier is the thing on the other end of the socket. The browser and Twilio send different audio formats and want different frames back, so each gets one object with the same five members. The call loop never knows which one it has.

```typescript ignore
import { createAudioConverter } from '@tanstack/ai'
import type { LiveAudioFormat } from '@tanstack/ai'
import type { RawData, WebSocket } from 'ws'

export interface Carrier {
  /** Audio format of the caller's chunks. */
  audio: LiveAudioFormat
  /** Pull caller audio out of one socket frame. Undefined for control frames. */
  audioIn: (data: RawData, isBinary: boolean) => Uint8Array | undefined
  /** Send 24 kHz 16-bit mono PCM to the caller. */
  speak: (pcm24k: Uint8Array) => void
  /** Stop audio that is still playing. The caller started talking. */
  clear: () => void
  /** Show text to the caller, when the carrier has a screen. */
  caption: (role: 'caller' | 'agent', text: string, final: boolean) => void
}

const PCM_24K: LiveAudioFormat = { encoding: 'linear16', sampleRate: 24000 }

export function browserCarrier(ws: WebSocket): Carrier {
  return {
    audio: PCM_24K,
    audioIn: (data, isBinary) => (isBinary ? toBytes(data) : undefined),
    speak: (pcm) => ws.send(pcm),
    clear: () => ws.send(JSON.stringify({ type: 'clear' })),
    caption: (role, text, final) =>
      ws.send(JSON.stringify({ type: 'caption', role, text, final })),
  }
}

function toBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}
```

The Twilio carrier comes in step 8. `createAudioConverter` is for that one.

## 4. Give the agent the docs

Create `src/server/search-docs.ts`. The model calls this tool before it answers, so answers come from the docs and not from memory. It reads the same `config.json` the docs site reads, ranks pages by keyword, and returns the top two.

```typescript ignore
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const RAW = 'https://raw.githubusercontent.com/TanStack/ai/main/docs'

let pages: Promise<Array<{ label: string; to: string }>> | undefined

function listPages() {
  pages ??= fetch(`${RAW}/config.json`)
    .then((r) => r.json())
    .then((config: unknown) => {
      const found: Array<{ label: string; to: string }> = []
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (typeof node !== 'object' || node === null) return
        if (
          'to' in node &&
          'label' in node &&
          typeof node.to === 'string' &&
          typeof node.label === 'string'
        ) {
          found.push({ label: node.label, to: node.to })
        }
        Object.values(node).forEach(walk)
      }
      walk(config)
      return found
    })
  return pages
}

export const searchDocs = toolDefinition({
  name: 'search_docs',
  description:
    'Search the TanStack AI documentation. Call this before answering any question about TanStack AI features, APIs, adapters, or setup.',
  inputSchema: z.object({
    query: z
      .string()
      .meta({ description: 'Two to five keywords, for example "tool approval"' }),
  }),
  outputSchema: z.object({
    pages: z.array(
      z.object({ title: z.string(), url: z.string(), text: z.string() }),
    ),
  }),
}).server(async ({ query }) => {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean)
  const ranked = (await listPages())
    .map((page) => {
      const haystack = `${page.label} ${page.to}`.toLowerCase()
      return { page, score: words.filter((w) => haystack.includes(w)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  const results = await Promise.all(
    ranked.map(async ({ page }) => {
      const markdown = await fetch(`${RAW}/${page.to}.md`).then((r) => r.text())
      const text = markdown.replace(/^---[\s\S]*?---\s*/, '').slice(0, 4000)
      return {
        title: page.label,
        url: `https://tanstack.com/ai/latest/docs/${page.to}`,
        text,
      }
    }),
  )
  return { pages: results }
})
```

For your own product, swap the two `fetch` calls for your help centre or a vector search. The tool shape stays the same.

## 5. Run the call

Create `src/server/call.ts`. This is the whole agent. Read it top to bottom once, then the notes below.

```typescript ignore
import { chat, generateSpeech, transcriptionSession } from '@tanstack/ai'
import {
  openaiLiveTranscription,
  openaiSpeech,
  openaiText,
} from '@tanstack/ai-openai'
import { searchDocs } from './search-docs.ts'
import type { ModelMessage } from '@tanstack/ai'
import type { WebSocket } from 'ws'
import type { Carrier } from './carriers.ts'

const SYSTEM_PROMPT = `You are the phone support agent for TanStack AI, a TypeScript AI SDK.
You are on a voice call. The caller hears your words, they do not read them.
- Call search_docs before you answer a question about TanStack AI.
- Answer in one to three short sentences. Then stop and let the caller speak.
- Say package and function names as words. Never read out URLs, code, or markdown.
- If the docs do not cover the question, say so and suggest where to look.`

export async function handleCall(ws: WebSocket, carrier: Carrier) {
  const callId = crypto.randomUUID()
  const messages: Array<ModelMessage> = []

  // Listen before the session opens. Callers send audio right away.
  const early: Array<Uint8Array> = []
  let send = (audio: Uint8Array) => {
    early.push(audio)
  }
  ws.on('message', (data, isBinary) => {
    const audio = carrier.audioIn(data, isBinary)
    if (audio) send(audio)
  })
  const hungUp = new AbortController()
  ws.on('close', () => hungUp.abort())

  const session = await transcriptionSession({
    adapter: openaiLiveTranscription('gpt-transcribe'),
    audio: carrier.audio,
    // Pin the language. Without it the provider guesses per utterance, and a
    // short word like "yes" can come back in the wrong language.
    language: 'en',
    modelOptions: {
      prompt:
        'A support call about TanStack AI, a TypeScript SDK. Expect words like TanStack, useChat, toolDefinition, adapter, Zod, OpenAI, Anthropic, Gemini.',
    },
    abortSignal: hungUp.signal,
  })
  send = (audio) => session.send(audio)
  for (const chunk of early) session.send(chunk)
  ws.on('close', () => void session.close())

  let turn = ''
  let replying: AbortController | undefined
  for await (const event of session) {
    switch (event.type) {
      case 'interim':
        if (replying) {
          replying.abort()
          replying = undefined
          carrier.clear()
        }
        carrier.caption('caller', `${turn} ${event.text}`.trim(), false)
        break
      case 'final':
        turn = `${turn} ${event.text}`.trim()
        break
      case 'turn-end': {
        if (!turn) break
        const question = turn
        turn = ''
        carrier.caption('caller', question, true)
        messages.push({ role: 'user', content: question })
        replying = new AbortController()
        void reply(callId, messages, carrier, replying)
        break
      }
      case 'error':
        console.error('transcription error', event.error)
        break
    }
  }
}

async function reply(
  callId: string,
  messages: Array<ModelMessage>,
  carrier: Carrier,
  abortController: AbortController,
) {
  const { signal } = abortController
  let pending = ''
  let full = ''
  // Start text-to-speech for each sentence at once. Deliver them in order.
  let delivery = Promise.resolve()
  const say = (sentence: string) => {
    const audio = generateSpeech({
      adapter: openaiSpeech('gpt-4o-mini-tts'),
      text: sentence,
      format: 'pcm',
      threadId: callId,
      abortSignal: signal,
    }).catch((error: unknown) => {
      // A barge-in aborts every clip still in flight. That is not a failure.
      if (signal.aborted) return undefined
      throw error
    })
    delivery = delivery.then(async () => {
      const result = await audio
      if (result && !signal.aborted) {
        carrier.speak(Buffer.from(result.audio, 'base64'))
      }
    })
  }

  try {
    const stream = chat({
      adapter: openaiText('gpt-6.1-terra'),
      systemPrompts: [SYSTEM_PROMPT],
      tools: [searchDocs],
      messages,
      threadId: callId,
      abortController,
    })
    for await (const chunk of stream) {
      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') continue
      pending += chunk.delta
      full += chunk.delta
      // A sentence ends at . ! or ? followed by a space.
      let end = pending.search(/[.!?]\s/)
      while (end !== -1) {
        say(pending.slice(0, end + 1))
        pending = pending.slice(end + 2)
        end = pending.search(/[.!?]\s/)
      }
    }
    if (pending.trim()) say(pending)
    await delivery
  } catch (error) {
    if (signal.aborted) return
    throw error
  }
  if (full) {
    messages.push({ role: 'assistant', content: full })
    carrier.caption('agent', full, true)
  }
}
```

Five things make it feel like a call and not a form:

- **Pin the language.** The transcriber guesses the language for each utterance unless you set `language`. A one-word answer gives it nothing to guess from. The `prompt` tells it which product names to expect.
- **Listen first.** The socket listeners attach before `transcriptionSession()` opens. Audio that arrives in that gap waits in `early`, then goes in.
- **Turns, not files.** `final` text piles up in `turn`. `turn-end` means the caller paused, so that text becomes one user message and `chat()` runs.
- **Speak by the sentence.** `generateSpeech()` starts the moment a sentence is complete, while the model still writes the next one. The promise chain keeps playback in order. The caller hears the first sentence in about a second.
- **Barge-in.** An `interim` event while the agent is talking means the caller spoke over it. Abort the reply, tell the carrier to clear its audio, and the next `turn-end` starts fresh.

The system prompt is a procedure for a reader that cannot see. Short answers, no URLs, and a rule to search before it speaks.

## 6. Host the socket

Create `src/server/vite-plugin.ts`. It takes WebSocket upgrades on two paths and hands each socket to `handleCall` with the right carrier.

```typescript ignore
import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import { browserCarrier, twilioCarrier } from './carriers.ts'
import type { Plugin } from 'vite'

export function voiceServer(): Plugin {
  return {
    name: 'voice-server',
    configureServer(server) {
      if (!server.httpServer) return
      const wss = new WebSocketServer({ noServer: true })
      server.httpServer.on('upgrade', (request, socket, head) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        if (path !== '/voice' && path !== '/twilio') return
        wss.handleUpgrade(request, socket, head, (ws) => {
          const carrier =
            path === '/twilio' ? twilioCarrier(ws) : browserCarrier(ws)
          handleCall(ws, carrier).catch((error: unknown) => {
            console.error('call failed', error)
            ws.close(1011, 'call failed')
          })
        })
      })
    },
  }
}
```

Add it to `vite.config.ts` before the other plugins, and load `.env.local` so the server sees the key:

```typescript ignore
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { voiceServer } from './src/server/vite-plugin.ts'

for (const name of ['.env.local', '.env']) {
  const path = resolve(import.meta.dirname, name)
  if (existsSync(path)) process.loadEnvFile(path)
}

export default defineConfig({
  plugins: [voiceServer(), tanstackStart(), viteReact()],
})
```

## 7. Build the softphone

Replace `src/routes/index.tsx`. The page does three things: it sends microphone PCM up the socket, plays PCM that comes down, and shows captions.

An `AudioWorklet` turns the microphone's float samples into 16-bit PCM. It runs off the main thread, so the page stays smooth.

```tsx ignore
import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

type Caption = { role: 'caller' | 'agent'; text: string; final: boolean }

const PCM_WORKLET = `
class PcmSender extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0]
    if (input) {
      const pcm = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }
    return true
  }
}
registerProcessor('pcm-sender', PcmSender)
`

async function startCall(onCaption: (caption: Caption) => void) {
  const context = new AudioContext({ sampleRate: 24000 })
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET], { type: 'text/javascript' }),
  )
  await context.audioWorklet.addModule(workletUrl)

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/voice`)
  ws.binaryType = 'arraybuffer'
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('Could not open the voice socket'))
  })

  const sender = new AudioWorkletNode(context, 'pcm-sender')
  sender.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(event.data)
  }
  context.createMediaStreamSource(mic).connect(sender)

  // Queue each PCM frame right after the previous one so playback is gapless.
  let playAt = 0
  const playing = new Set<AudioBufferSourceNode>()
  ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
    if (typeof event.data === 'string') {
      const message: unknown = JSON.parse(event.data)
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message)
      ) {
        return
      }
      if (message.type === 'clear') {
        for (const source of playing) source.stop()
        playing.clear()
        playAt = 0
      }
      if (message.type === 'caption' && isCaption(message)) onCaption(message)
      return
    }
    const pcm = new Int16Array(event.data)
    const buffer = context.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(Float32Array.from(pcm, (s) => s / 0x8000), 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    playAt = Math.max(playAt, context.currentTime)
    source.start(playAt)
    playAt += buffer.duration
    playing.add(source)
    source.onended = () => playing.delete(source)
  }

  return () => {
    ws.close()
    for (const track of mic.getTracks()) track.stop()
    void context.close()
    URL.revokeObjectURL(workletUrl)
  }
}

function isCaption(value: object): value is Caption {
  return (
    'role' in value &&
    (value.role === 'caller' || value.role === 'agent') &&
    'text' in value &&
    typeof value.text === 'string' &&
    'final' in value &&
    typeof value.final === 'boolean'
  )
}

function CallPage() {
  const [captions, setCaptions] = useState<Array<Caption>>([])
  const [error, setError] = useState('')
  const hangUp = useRef<(() => void) | null>(null)
  const inCall = hangUp.current !== null

  const onCaption = (caption: Caption) =>
    setCaptions((list) => {
      // Interim caller text replaces the previous interim line.
      const last = list.at(-1)
      const keep =
        last && !last.final && last.role === caption.role
          ? list.slice(0, -1)
          : list
      return [...keep, caption]
    })

  const toggleCall = async () => {
    if (hangUp.current) {
      hangUp.current()
      hangUp.current = null
      setCaptions([])
      return
    }
    try {
      setError('')
      hangUp.current = await startCall(onCaption)
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start the call',
      )
    }
  }

  return (
    <div>
      {captions.map((caption, index) => (
        <p key={index}>
          <b>{caption.role === 'agent' ? 'Agent' : 'You'}</b> {caption.text}
        </p>
      ))}
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={() => void toggleCall()}>
        {inCall ? 'Hang up' : 'Start call'}
      </button>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: CallPage,
})
```

`echoCancellation: true` matters. Without it the microphone hears the agent's own voice and barge-in fires on every reply.

Run the app and click Start call. Ask "How do I add a server tool?" and pause. The agent answers from [Server Tools](../tools/server-tools). Talk over it, and it stops.

## 8. Take a phone call

Twilio Media Streams send JSON text frames with base64 G.711 μ-law audio at 8 kHz, and want the same back. Add this carrier to `src/server/carriers.ts`. `transcriptionSession()` takes the μ-law as is. On the way out, `createAudioConverter` resamples the 24 kHz speech to 8 kHz and `toMulaw` encodes it.

```typescript ignore
export function twilioCarrier(ws: WebSocket): Carrier {
  let streamSid = ''
  const toPcm8k = createAudioConverter(PCM_24K, {
    encoding: 'linear16',
    sampleRate: 8000,
  })
  return {
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    audioIn: (data) => {
      const frame: unknown = JSON.parse(toBytes(data).toString())
      if (!isTwilioFrame(frame)) return undefined
      if (frame.event === 'start') streamSid = frame.start.streamSid
      if (frame.event === 'media') {
        return Buffer.from(frame.media.payload, 'base64')
      }
      return undefined
    },
    speak: (pcm) => {
      const payload = Buffer.from(toMulaw(toPcm8k(pcm))).toString('base64')
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
    },
    clear: () => ws.send(JSON.stringify({ event: 'clear', streamSid })),
    caption: () => {},
  }
}

type TwilioFrame =
  | { event: 'start'; start: { streamSid: string } }
  | { event: 'media'; media: { payload: string } }
  | { event: 'stop' }

function isTwilioFrame(value: unknown): value is TwilioFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    typeof value.event === 'string'
  )
}

/** G.711 μ-law encode of 16-bit little-endian PCM. */
function toMulaw(pcm16: Uint8Array): Uint8Array {
  const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
  const out = new Uint8Array(pcm16.byteLength >> 1)
  for (let i = 0; i < out.length; i++) {
    let sample = view.getInt16(i * 2, true)
    const sign = sample < 0 ? 0x80 : 0
    if (sign) sample = -sample
    sample = Math.min(sample, 32635) + 0x84
    let exponent = 7
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
      exponent--
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff
  }
  return out
}
```

Then connect a number:

1. Run `ngrok http 3100` and copy the `https` host.
2. In the Twilio console, set the number's voice webhook to return this TwiML:

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR-NGROK-HOST/twilio" />
  </Connect>
</Response>
```

3. Call the number and ask a question.

The same `handleCall` runs. Only the carrier changed.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/voice-support-agent`.

<!-- ::client-example library=ai framework=react slug=voice-support-agent -->

You have a support line that answers from your docs, in the browser and on the phone.

## How it works

Three activities, one loop:

- `transcriptionSession()` from [Live Transcription](../media/live-transcription) turns audio into `interim`, `final`, and `turn-end` events.
- `chat()` with one [server tool](../tools/server-tools) writes the answer. The tool call happens before the first word, so the pause you hear is the model reading the docs.
- `generateSpeech()` from [Text-to-Speech](../media/text-to-speech) makes one clip per sentence.

Each sentence is one round trip to the speech provider. The first sentence arrives in about a second, and a long reply can leave small gaps between sentences. Streaming speech is a separate piece of work tracked in [issue #2046](https://github.com/TanStack/ai/issues/2046).

The full example is on GitHub: [TanStack/ai `examples/react/voice-support-agent`](https://github.com/TanStack/ai/tree/main/examples/react/voice-support-agent).

Next, pick one:

- Swap the provider for audio in: [Pick a provider](../media/live-transcription#pick-a-provider).
- Run this on Cloudflare with the Workers AI binding: [Cloudflare adapter](../adapters/cloudflare).
- Give the agent your own data: [Server Tools](../tools/server-tools).
