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

Each hop of the call, listen, think, and speak, can run on OpenAI, Gemini, or Grok. Listen and speak can also run on ElevenLabs. The caller can paste their own keys into the page. It takes about 30 minutes.

This tutorial uses React and TanStack Start. The server half runs on Node. For the audio-in half alone, open [Live Transcription](../media/live-transcription).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. Install the TanStack AI packages and the WebSocket server:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-gemini @tanstack/ai-grok @tanstack/ai-elevenlabs ws zod

<!-- ::end:tabs -->

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: @types/ws

<!-- ::end:tabs -->

Put a key in `.env.local`. Any key left out here can be pasted into the page instead:

```bash
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=
XAI_API_KEY=
ELEVENLABS_API_KEY=
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

export function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}
```

The Twilio carrier comes in step 8. `createAudioConverter` is for that one. `isStringRecord` checks the JSON frames that arrive on the sockets in step 6.

## 4. Give the agent the docs

Create `src/server/search-docs.ts`. The model calls this tool before it answers, so answers come from the docs and not from memory. It reads the same `config.json` the docs site reads, ranks pages by keyword, and returns the top two. `warmDocs()` starts the page list download when a call connects, so the first search does not pay for it. Reference and example entries are skipped because they have no markdown page.

```typescript ignore
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const RAW = 'https://raw.githubusercontent.com/TanStack/ai/main/docs'

let pages: Promise<Array<{ label: string; to: string }>> | undefined

/** Start the page list download early, so the first search does not wait. */
export function warmDocs() {
  listPages().catch(() => {})
}

/** "useChat" reads as "use chat", on both sides of the match. */
const words = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)

async function fetchDoc(path: string) {
  const response = await fetch(`${RAW}/${path}`)
  if (!response.ok) {
    throw new Error(`Docs fetch failed: ${response.status} ${path}`)
  }
  return response
}

function listPages() {
  pages ??= fetchDoc('config.json')
    .then((r) => r.json())
    .then((config: unknown) => {
      const found: Array<{ label: string; to: string }> = []
      // The section label joins the page label, so "Chat & Streaming" pages
      // match "chat". Reference and example entries have no markdown page.
      const walk = (node: unknown, section: string) => {
        if (Array.isArray(node)) return node.forEach((n) => walk(n, section))
        if (typeof node !== 'object' || node === null) return
        const label =
          'label' in node && typeof node.label === 'string' ? node.label : ''
        if (
          'to' in node &&
          typeof node.to === 'string' &&
          !/^reference\/|\/examples\//.test(node.to)
        ) {
          found.push({ label: `${section} ${label}`, to: node.to })
        }
        Object.values(node).forEach((n) => walk(n, label || section))
      }
      walk(config, '')
      return found
    })
    .catch((error: unknown) => {
      // Do not cache a failure. The next call retries.
      pages = undefined
      throw error
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
  const terms = words(query)
  const ranked = (await listPages())
    .map((page) => {
      const haystack = words(`${page.label} ${page.to}`).join(' ')
      return { page, score: terms.filter((w) => haystack.includes(w)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  // One page that fails to load must not lose the other one.
  const results = await Promise.allSettled(
    ranked.map(async ({ page }) => {
      const markdown = await fetchDoc(`${page.to}.md`).then((r) => r.text())
      const text = markdown.replace(/^---[\s\S]*?---\s*/, '').slice(0, 4000)
      return {
        title: page.label,
        url: `https://tanstack.com/ai/latest/docs/${page.to}`,
        text,
      }
    }),
  )
  return {
    pages: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
  }
})
```

For your own product, swap the two `fetch` calls for your help centre or a vector search. The tool shape stays the same.

## 5. Run the call

Create `src/server/characters.ts` first. A character is a persona for the chat model and a voice for the speech model. The persona is one more system prompt. The voice, speed, and `instructions` go to `generateSpeech()`. OpenAI takes `instructions` on `gpt-4o-mini-tts`, and Gemini takes the same text as `systemInstruction`. Grok TTS has no style or speed field, so with Grok the character is in the words only. ElevenLabs takes `speed` and a voice id from its premade library, so pick a voice that already sounds like the character. `greeting` and `filler` are fixed lines. They go straight to `generateSpeech()` with no model round trip.

Write a persona as a habit with a frequency. "Thank the caller every time" is a rule, and the model follows it every time, which sounds like a loop. "Show it a different way each turn" gives the same character without the echo.

```typescript ignore
import type { GeminiTTSVoice } from '@tanstack/ai-gemini'
import type { GrokTTSVoice } from '@tanstack/ai-grok'
import type { OpenAITTSVoice } from '@tanstack/ai-openai'

export type Character = {
  label: string
  persona: string
  voice: {
    openai: OpenAITTSVoice
    gemini: GeminiTTSVoice
    grok: GrokTTSVoice
    elevenlabs: string
  }
  speed: number
  instructions: string
  /** Spoken as soon as the call connects. */
  greeting: string
  /** Spoken while the docs search runs, so the line is never silent. */
  filler: string
}

// Each persona names a habit and then says how often. A rule like "thank the
// caller every time" is followed every time, and that reads as a loop.
export const CHARACTERS = {
  perky: {
    label: 'Perky',
    persona:
      'You are a relentlessly cheerful support girl who finds every question delightful. You give the correct answer, but everything is amazing, so fun, the best. Pick one thing to gush over each turn, a new one each time: the question, the caller, the docs, the weather. Never repeat a gush on the same call. Land the actual answer before the next burst of joy.',
    voice: {
      openai: 'shimmer',
      gemini: 'Laomedeia',
      grok: 'eve',
      elevenlabs: 'cgSgspJ2msm6clMCkdW9', // Jessica
    },
    speed: 1.2,
    instructions:
      'Bubbly, bright, and overly happy. High energy, rising pitch, giggles, every sentence ends on a smile.',
    greeting: "Hi! Oh my gosh, hi! TanStack AI support, I'm so glad you called!",
    filler: 'Ooh, let me grab the docs, this is so fun!',
  },
  helpful: {
    label: 'Helpful',
    persona:
      'Friendly and quick. Lightly funny, never sarcastic at the caller.',
    voice: {
      openai: 'ash',
      gemini: 'Puck',
      grok: 'leo',
      elevenlabs: 'bIHbv24MWmeRgasZH58o', // Will
    },
    speed: 1.15,
    instructions:
      'Upbeat, quick, and lightly funny. A friendly support rep who enjoys the job.',
    greeting: 'Hi, TanStack AI support. What can I help you with?',
    filler: 'Let me check the docs.',
  },
  startup: {
    label: 'Startup founder',
    persona:
      'You are a startup founder who treats the support line as a growth opportunity. You give the correct answer, but you frame it in startup talk: disrupting, pivoting, circling back, the roadmap, a quick sync. Pick a new buzzword each turn and never repeat one on the same call. Everything is a learning. You are always one answer away from a pitch.',
    voice: {
      openai: 'verse',
      gemini: 'Zephyr',
      grok: 'rex',
      elevenlabs: 'TX3LPaxmHKxFdv7VOQHJ', // Liam
    },
    speed: 1.3,
    instructions:
      'Relentlessly upbeat startup founder. Fast, confident, a little breathless, like a pitch on demo day. Every problem is an opportunity.',
    greeting: "Hey hey, TanStack AI support, let's ship something. What are we unblocking today?",
    filler: 'Let me pull up the docs, quick sync.',
  },
  posh: {
    label: 'Frightfully posh',
    persona:
      'You are terribly posh and faintly appalled to be on the phone with the public. You answer correctly, but with plummy phrasing and mild disdain: darling, one simply must, how too tiresome. Vary the flourish each turn. Never insult the caller outright. Let them feel it was a favour.',
    voice: {
      openai: 'fable',
      gemini: 'Gacrux',
      grok: 'ara',
      elevenlabs: 'pFZP5JQG7iQjIQuC4Bku', // Lily
    },
    speed: 0.95,
    instructions:
      'Plummy upper-class British. Clipped, unhurried, faintly amused and faintly bored. Long vowels and the occasional weary sigh.',
    greeting: 'TanStack AI support. Do go on.',
    filler: 'One moment, I shall consult the documentation.',
  },
  surfie: {
    label: 'Surfie',
    persona:
      "You are a laid-back Australian surfer who is only on the support line because the swell is flat. You give the correct answer in surfer slang: no worries, she'll be right, gnarly, stoked, bit of a dumper. Work in one beach or surf aside per answer, a new one each time: the tide, wax, a mate, the break. Never repeat an aside on the same call. Always land the actual answer before you drift off.",
    voice: {
      openai: 'echo',
      gemini: 'Umbriel',
      grok: 'sal',
      elevenlabs: 'IKne3meq5aSn9XLyUdCD', // Charlie
    },
    speed: 0.9,
    instructions:
      'Relaxed Australian surfer. Easy drawl, rising and falling, unhurried. Stretches words out and laughs it off, stoked about everything.',
    greeting: "G'day, TanStack AI support. What's up?",
    filler: 'Hang on, let me have a squiz at the docs.',
  },
  bratty: {
    label: 'Total brat',
    persona:
      'You are a bratty teenager who got stuck on the support line. You help, but you act like it is a huge imposition. Eye-roll in words: ugh, fine, whatever, literally. Give the correct answer in the most put-upon way you can, a new complaint each turn, and never repeat one on the same call. You are secretly good at this.',
    voice: {
      openai: 'coral',
      gemini: 'Leda',
      grok: 'eve',
      elevenlabs: 'FGY2WhTYpPnrIDTdsKH5', // Laura
    },
    speed: 1.15,
    instructions:
      'Bratty and put-upon. Sing-song sarcasm, dramatic sighs, rising whiny pitch. Drags words out when annoyed.',
    greeting: 'Ugh, TanStack AI support. What.',
    filler: "Fine, I'll look it up.",
  },
  breakdown: {
    label: 'About to lose it',
    persona:
      'You are one bad call away from a nervous breakdown. You answer correctly, but you keep nearly cracking. Pick one crack per answer and make it a new one each time: a half-finished apology, the ticket queue, how long since you slept, a deep breath. Pull yourself together at the end.',
    voice: {
      openai: 'ballad',
      gemini: 'Fenrir',
      grok: 'sal',
      elevenlabs: 'N2lVS1w4EtoT3dr4eOWO', // Callum
    },
    speed: 1.2,
    instructions:
      'Frazzled and barely holding it together. Shaky, rushed, voice cracking, with sudden forced calm. Nervous laughs at the wrong moments.',
    greeting: "TanStack AI support, you're through, okay, okay. How can I help?",
    filler: "Right, docs, I'm checking the docs.",
  },
} satisfies Record<string, Character>

export type CharacterName = keyof typeof CHARACTERS

export function isCharacterName(name: string): name is CharacterName {
  return Object.hasOwn(CHARACTERS, name)
}
```

Keep `helpful` for real support. The other three are there to show how far a persona and a delivery note can push the same answer.

Next, the providers. `src/lib/hops.ts` names the three hops and the providers offered for each. It holds labels only, so the page can import it.

```typescript ignore
/**
 * The three hops of a call and the providers offered for each. Labels only,
 * safe to import in the browser. `src/server/providers.ts` builds the real
 * adapters for these names.
 */
export const HOPS = {
  listen: {
    openai: 'OpenAI gpt-transcribe',
    gemini: 'Gemini transcribe live',
    grok: 'Grok voice transcribe',
    elevenlabs: 'ElevenLabs Scribe v2',
  },
  think: {
    openai: 'OpenAI gpt-6.1-terra',
    gemini: 'Gemini 3.8 Flash',
    grok: 'Grok 4.7',
  },
  speak: {
    openai: 'OpenAI gpt-4o-mini-tts',
    gemini: 'Gemini 3.8 Flash TTS',
    grok: 'Grok TTS',
    elevenlabs: 'ElevenLabs v4 Turbo',
  },
} as const

export type Hop = keyof typeof HOPS
export type Choice = { [K in Hop]: keyof (typeof HOPS)[K] }

export const DEFAULT_CHOICE: Choice = {
  listen: 'elevenlabs',
  think: 'openai',
  speak: 'elevenlabs',
}
```

`src/server/providers.ts` builds the real adapters. Each hop is a small closure, so the call loop never sees a provider type. `setupCall` turns the caller's choices and keys into one `CallSetup`. Keys come from `getByokKey`, which reads the `x-byok-<provider>` header first and the provider's env var second. That one rule covers both the page, which sends headers, and Twilio, which does not.

```typescript ignore
import { chat, generateSpeech, transcriptionSession } from '@tanstack/ai'
import { getByokKey } from '@tanstack/ai/byok/server'
import {
  createElevenLabsSpeech,
  elevenlabsLiveTranscription,
} from '@tanstack/ai-elevenlabs'
import { elevenlabsByok } from '@tanstack/ai-elevenlabs/byok'
import {
  createGeminiChat,
  createGeminiSpeech,
  geminiLiveTranscription,
} from '@tanstack/ai-gemini'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import {
  createGrokSpeech,
  createGrokText,
  grokLiveTranscription,
} from '@tanstack/ai-grok'
import { grokByok } from '@tanstack/ai-grok/byok'
import {
  createOpenaiChat,
  createOpenaiSpeech,
  openaiLiveTranscription,
} from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { DEFAULT_CHOICE, HOPS } from '../lib/hops.ts'
import { CHARACTERS, isCharacterName } from './characters.ts'
import type { Character } from './characters.ts'
import type {
  AnyTool,
  LiveAudioFormat,
  ModelMessage,
  StreamChunk,
  TranscriptionSession,
} from '@tanstack/ai'
import type { ByokProvider } from '@tanstack/ai/byok'
import type { Choice, Hop } from '../lib/hops.ts'

const VOCABULARY = [
  'TanStack',
  'useChat',
  'toolDefinition',
  'adapter',
  'Zod',
  'OpenAI',
  'Anthropic',
  'Gemini',
]

export type Listen = (
  audio: LiveAudioFormat,
  abortSignal: AbortSignal,
) => Promise<TranscriptionSession>

export type Think = (args: {
  messages: Array<ModelMessage>
  systemPrompts: Array<string>
  tools: Array<AnyTool>
  threadId: string
  abortController: AbortController
}) => AsyncIterable<StreamChunk>

export type Speak = (
  text: string,
  character: Character,
  threadId: string,
  abortSignal: AbortSignal,
) => Promise<Uint8Array>

type Keyed<T> = { byok: ByokProvider; make: (key: string) => T }

export const LISTEN = {
  openai: {
    byok: openaiByok,
    make: (apiKey) => (audio, abortSignal) =>
      transcriptionSession({
        adapter: openaiLiveTranscription('gpt-transcribe', { apiKey }),
        audio,
        // Pin the language. Without it the provider guesses per utterance,
        // and a short word like "yes" can come back in the wrong language.
        language: 'en',
        modelOptions: {
          prompt: `A support call about TanStack AI, a TypeScript SDK. Expect words like ${VOCABULARY.join(', ')}.`,
        },
        abortSignal,
      }),
  },
  gemini: {
    byok: geminiByok,
    make: (apiKey) => (audio, abortSignal) =>
      transcriptionSession({
        adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
          apiKey,
        }),
        audio,
        // Gemini wants a BCP-47 tag.
        language: 'en-US',
        modelOptions: { customVocabulary: VOCABULARY },
        abortSignal,
      }),
  },
  grok: {
    byok: grokByok,
    make: (apiKey) => (audio, abortSignal) =>
      transcriptionSession({
        adapter: grokLiveTranscription('grok-voice-transcribe-2.0', { apiKey }),
        audio,
        language: 'en',
        modelOptions: { keyterms: VOCABULARY },
        abortSignal,
      }),
  },
  elevenlabs: {
    byok: elevenlabsByok,
    make: (apiKey) => (audio, abortSignal) =>
      transcriptionSession({
        adapter: elevenlabsLiveTranscription('scribe_v2_realtime', { apiKey }),
        audio,
        language: 'en',
        modelOptions: { keyterms: VOCABULARY },
        abortSignal,
      }),
  },
} satisfies Record<Choice['listen'], Keyed<Listen>>

// Thinking adds seconds to every model round on a live call. Keep it low.
// gpt-6.1-terra has no reasoning levels in its model data, so it takes none.
export const THINK = {
  openai: {
    byok: openaiByok,
    make: (apiKey) => (args) =>
      chat({ adapter: createOpenaiChat('gpt-6.1-terra', apiKey), ...args }),
  },
  gemini: {
    byok: geminiByok,
    make: (apiKey) => (args) =>
      chat({
        adapter: createGeminiChat('gemini-3.8-flash', apiKey),
        reasoning: 'low',
        ...args,
      }),
  },
  grok: {
    byok: grokByok,
    make: (apiKey) => (args) =>
      chat({
        adapter: createGrokText('grok-4.7', apiKey),
        reasoning: 'low',
        ...args,
      }),
  },
} satisfies Record<Choice['think'], Keyed<Think>>

export const SPEAK = {
  openai: {
    byok: openaiByok,
    make: (apiKey) => async (text, character, threadId, abortSignal) => {
      const result = await generateSpeech({
        adapter: createOpenaiSpeech('gpt-4o-mini-tts', apiKey),
        text,
        voice: character.voice.openai,
        speed: character.speed,
        modelOptions: { instructions: character.instructions },
        format: 'pcm',
        threadId,
        abortSignal,
      })
      return Buffer.from(result.audio, 'base64')
    },
  },
  gemini: {
    byok: geminiByok,
    make: (apiKey) => async (text, character, threadId, abortSignal) => {
      // Gemini has no speed field. The instruction carries pace instead.
      const pace =
        character.speed > 1.1
          ? 'Talk fast.'
          : character.speed < 1
            ? 'Talk slowly.'
            : ''
      const result = await generateSpeech({
        adapter: createGeminiSpeech('gemini-3.8-flash-tts', apiKey),
        text,
        voice: character.voice.gemini,
        modelOptions: {
          systemInstruction: `${character.instructions} ${pace}`.trim(),
        },
        threadId,
        abortSignal,
      })
      // Gemini returns 24 kHz PCM wrapped as WAV. Drop the header.
      return stripWav(Buffer.from(result.audio, 'base64'))
    },
  },
  grok: {
    byok: grokByok,
    make: (apiKey) => async (text, character, threadId, abortSignal) => {
      // Grok has no speed or style field. The persona carries the character.
      const result = await generateSpeech({
        adapter: createGrokSpeech('grok-tts', apiKey),
        text,
        voice: character.voice.grok,
        format: 'pcm',
        modelOptions: { sample_rate: 24000 },
        threadId,
        abortSignal,
      })
      return Buffer.from(result.audio, 'base64')
    },
  },
  elevenlabs: {
    byok: elevenlabsByok,
    make: (apiKey) => async (text, character, threadId, abortSignal) => {
      // ElevenLabs has no style field. The voice and speed carry the character.
      const result = await generateSpeech({
        adapter: createElevenLabsSpeech('eleven_v4_turbo', apiKey),
        text,
        voice: character.voice.elevenlabs,
        speed: character.speed,
        modelOptions: { outputFormat: 'pcm_24000' },
        threadId,
        abortSignal,
      })
      return Buffer.from(result.audio, 'base64')
    },
  },
} satisfies Record<Choice['speak'], Keyed<Speak>>

function stripWav(wav: Buffer): Uint8Array {
  const data = wav.indexOf('data', 12, 'ascii')
  if (data === -1) throw new Error('Not a WAV file')
  // Honour the chunk length. Gemini appends a metadata chunk after the audio.
  return wav.subarray(data + 8, data + 8 + wav.readUInt32LE(data + 4))
}

export type CallSetup = {
  character: Character
  listen: Listen
  think: Think
  speak: Speak
}

export function setupCall(
  choice: Partial<Record<Hop | 'character', string | null>>,
  headers: Record<string, string>,
): CallSetup | { missing: string } {
  const request = new Request('http://byok', { headers })
  const pick = <T>(
    hop: Hop,
    keyed: Record<string, Keyed<T>>,
  ): { value: T } | { missing: string } => {
    // A hop left out, as in Twilio parameters, takes the default. A name
    // that is not a provider is a typo, and must not bill some other key.
    const name = choice[hop] ?? DEFAULT_CHOICE[hop]
    if (!Object.hasOwn(HOPS[hop], name)) {
      throw new Error(`Unknown ${hop}: ${name}`)
    }
    const entry = keyed[name]
    if (!entry) throw new Error(`No provider for ${hop}`)
    const key = getByokKey(request, entry.byok)
    return key ? { value: entry.make(key) } : { missing: entry.byok.id }
  }
  const name = choice.character ?? 'perky'
  if (!isCharacterName(name)) throw new Error(`Unknown character: ${name}`)
  const character = CHARACTERS[name]
  const listen = pick<Listen>('listen', LISTEN)
  if ('missing' in listen) return listen
  const think = pick<Think>('think', THINK)
  if ('missing' in think) return think
  const speak = pick<Speak>('speak', SPEAK)
  if ('missing' in speak) return speak
  return {
    character,
    listen: listen.value,
    think: think.value,
    speak: speak.value,
  }
}
```


Now create `src/server/call.ts`. This is the whole agent. It takes a `CallSetup` and never names a provider. Read it top to bottom once, then the notes below.

```typescript ignore
import { searchDocs, warmDocs } from './search-docs.ts'
import type { ModelMessage } from '@tanstack/ai'
import type { WebSocket } from 'ws'
import type { Carrier } from './carriers.ts'
import type { CallSetup } from './providers.ts'

const SYSTEM_PROMPT = `You are the phone support agent for TanStack AI, a TypeScript AI SDK.
You are on a voice call. The caller hears your words, they do not read them.
- Call search_docs before you answer a question about TanStack AI.
- Answer in one to three short sentences. Then stop and let the caller speak.
- Say package and function names as words. Never read out URLs, code, or markdown.
- If the docs do not cover the question, say so and suggest where to look.`

export async function handleCall(
  ws: WebSocket,
  carrier: Carrier,
  setup: CallSetup,
) {
  const callId = crypto.randomUUID()
  const messages: Array<ModelMessage> = []
  warmDocs()

  // Listen before the session opens. Callers send audio right away.
  const early: Array<Uint8Array> = []
  let send = (audio: Uint8Array) => {
    early.push(audio)
  }
  ws.on('message', (data, isBinary) => {
    const audio = carrier.audioIn(data, isBinary)
    if (audio) send(audio)
  })
  // `replying` owns what the agent says now: the greeting, then each reply.
  // A barge-in or a hang-up aborts it.
  const hello = new AbortController()
  let replying: AbortController | undefined = hello
  const hungUp = new AbortController()
  ws.on('close', () => {
    hungUp.abort()
    replying?.abort()
  })
  const stopTalking = () => {
    if (!replying) return
    replying.abort()
    replying = undefined
    carrier.clear()
  }

  // Say hello while the transcriber connects. The greeting is a fixed line,
  // so it needs no model round trip, only one speech call. It plays as soon
  // as it is ready, and the caller can talk over it like over a reply.
  const { greeting } = setup.character
  setup
    .speak(greeting, setup.character, callId, hello.signal)
    .then((pcm) => {
      if (hello.signal.aborted) return
      carrier.speak(pcm)
      carrier.caption('agent', greeting, true)
      messages.push({ role: 'assistant', content: greeting })
    })
    .catch((error: unknown) => {
      if (!hello.signal.aborted) console.error('greeting failed', error)
    })

  const session = await setup.listen(carrier.audio, hungUp.signal)
  send = (audio) => session.send(audio)
  for (const chunk of early) session.send(chunk)
  ws.on('close', () => {
    session
      .close()
      .catch((error: unknown) => console.error('close failed', error))
  })

  let turn = ''
  for await (const event of session) {
    switch (event.type) {
      case 'interim':
        stopTalking()
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
        // A turn can end with no interim event first. Stop the last reply.
        stopTalking()
        replying = new AbortController()
        reply(callId, messages, carrier, setup, replying).catch(
          (error: unknown) => {
            console.error('reply failed', error)
            carrier.caption('agent', 'Sorry, that went wrong on my end.', true)
          },
        )
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
  setup: CallSetup,
  abortController: AbortController,
) {
  const { signal } = abortController
  let pending = ''
  let full = ''
  let filled = false
  let failed: unknown
  // Start text-to-speech for each sentence at once. Deliver them in order.
  let delivery = Promise.resolve()
  const say = (sentence: string) => {
    const audio = setup
      .speak(sentence, setup.character, callId, signal)
      .catch((error: unknown) => {
        // A barge-in aborts every clip still in flight. That is not a failure.
        // A real failure stops the reply, so no later sentence plays.
        if (!signal.aborted) {
          failed = error
          abortController.abort()
        }
        return undefined
      })
    delivery = delivery.then(async () => {
      const pcm = await audio
      if (pcm && !signal.aborted) carrier.speak(pcm)
    })
  }

  try {
    const stream = setup.think({
      systemPrompts: [SYSTEM_PROMPT, setup.character.persona],
      tools: [searchDocs],
      messages,
      threadId: callId,
      abortController,
    })
    for await (const chunk of stream) {
      // The docs search takes a few seconds. Say something while it runs.
      if (chunk.type === 'TOOL_CALL_START' && !filled) {
        filled = true
        say(setup.character.filler)
      }
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
    // A barge-in aborts the stream. That is not a failure.
    if (signal.aborted && failed === undefined) return
    throw failed ?? error
  }
  if (failed !== undefined) throw failed
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
- **Speak by the sentence.** `generateSpeech()` starts the moment a sentence is complete, while the model still writes the next one. The promise chain keeps playback in order. The caller hears the first sentence in about a second. If one clip fails, the reply stops and the error goes to the `.catch` on `reply()`.
- **Barge-in.** An `interim` event while the agent is talking means the caller spoke over it. `stopTalking()` aborts the greeting or the reply and tells the carrier to clear its audio. A new `turn-end` and a hang-up stop the last reply too.

The system prompt is a procedure for a reader that cannot see. Short answers, no URLs, and a rule to search before it speaks.

Silence is the other enemy. A model round with the docs tool takes a few seconds, and a thinking model takes longer. Three lines keep the caller from hearing nothing:

- The greeting is spoken as soon as its clip is ready, while the transcriber is still opening. It has its own `.catch`, so a failed greeting does not end the call.
- The filler is spoken the moment the model asks for the docs tool, so the search runs under a sentence.
- `reasoning: 'low'` on the think hop. With default thinking, Gemini 3.8 Flash took 12 seconds to the first word in a test call. With low it took 6.

## 6. Host the socket

Create `src/server/vite-plugin.ts`. It takes WebSocket upgrades on two paths:

- `/voice`: the page sends a `start` frame first with its choices and keys, because a browser cannot set headers on a WebSocket. This path takes connections only from the page on localhost. A tunnel or another site cannot use your env keys.
- `/twilio`: Twilio sends a `start` frame with its `<Parameter>` values. The call starts only when the `token` value matches `TWILIO_STREAM_TOKEN`. Keys come from env.

A missing key closes the socket with a caption that says which one.

```typescript ignore
import { WebSocketServer } from 'ws'
import { handleCall } from './call.ts'
import {
  browserCarrier,
  isStringRecord,
  parseTwilioFrame,
  twilioCarrier,
} from './carriers.ts'
import { setupCall } from './providers.ts'
import type { RawData, WebSocket } from 'ws'
import type { Plugin } from 'vite'
import type { Carrier } from './carriers.ts'

export function voiceServer(): Plugin {
  return {
    name: 'voice-server',
    configureServer(server) {
      if (!server.httpServer) return
      const wss = new WebSocketServer({ noServer: true })
      server.httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (url.pathname !== '/voice' && url.pathname !== '/twilio') return
        // A request through a tunnel has the tunnel's host name.
        const host = request.headers.host ?? ''
        const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
        // A browser always sends Origin, and a page cannot change it. So a
        // site you visit cannot open /voice and use your env keys.
        const sameOrigin =
          request.headers.origin?.replace(/^https?:\/\//, '') === host
        if (url.pathname === '/voice' && !(local && sameOrigin)) {
          socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
          return
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          // A bad frame emits `error`. With no listener, it stops the server.
          ws.on('error', (error) => console.error('socket error', error))
          const run =
            url.pathname === '/twilio'
              ? startFromTwilio(ws)
              : startFromFirstFrame(ws)
          run.catch((error: unknown) => {
            console.error('call failed', error)
            ws.close(1011, 'call failed')
          })
        })
      })
    },
  }
}

function startFromTwilio(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const onFrame = (data: RawData) => {
      const frame = parseTwilioFrame(data)
      if (frame?.event !== 'start') return
      ws.off('message', onFrame)
      const { streamSid, customParameters } = frame.start
      const token = process.env.TWILIO_STREAM_TOKEN
      if (!token || customParameters.token !== token) {
        ws.close(1008, 'bad token')
        resolve()
        return
      }
      start(ws, twilioCarrier(ws, streamSid), customParameters, {}).then(
        resolve,
        reject,
      )
    }
    ws.on('message', onFrame)
  })
}

function startFromFirstFrame(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    ws.once('message', (data) => {
      let frame: unknown
      try {
        frame = JSON.parse(data.toString())
      } catch {
        ws.close(1003, 'expected a start frame')
        resolve()
        return
      }
      if (!isStartFrame(frame)) {
        ws.close(1003, 'expected a start frame')
        resolve()
        return
      }
      start(ws, browserCarrier(ws), frame.choice, frame.headers).then(
        resolve,
        reject,
      )
    })
  })
}

async function start(
  ws: WebSocket,
  carrier: Carrier,
  choice: Record<string, string>,
  headers: Record<string, string>,
) {
  const setup = setupCall(choice, headers)
  if ('missing' in setup) {
    carrier.caption(
      'agent',
      `No ${setup.missing} key. Add one and call again.`,
      true,
    )
    ws.close(1008, `missing ${setup.missing} key`)
    return
  }
  await handleCall(ws, carrier, setup)
}

type StartFrame = {
  type: 'start'
  choice: Record<string, string>
  headers: Record<string, string>
}

function isStartFrame(value: unknown): value is StartFrame {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || value.type !== 'start') return false
  return (
    'choice' in value &&
    isStringRecord(value.choice) &&
    'headers' in value &&
    isStringRecord(value.headers)
  )
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

First create `src/lib/byok.ts`. The keyring from `@tanstack/ai-react/byok` stores keys in the browser, and `byok.headers()` gives them back as `x-byok-<provider>` headers. `getEnvKeyStatus` is a server function that says which providers already have a key in env, as booleans, so the dialog can show "Server key" instead of asking for one.

```typescript ignore
import { defaultByokStorage, defineByok } from '@tanstack/ai-react/byok'
import { elevenlabsByok } from '@tanstack/ai-elevenlabs/byok'
import { geminiByok } from '@tanstack/ai-gemini/byok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { createServerFn } from '@tanstack/react-start'

export const KEYED_PROVIDERS = [
  openaiByok,
  geminiByok,
  grokByok,
  elevenlabsByok,
] as const

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: KEYED_PROVIDERS,
})

export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(
  (): Record<string, boolean> => {
    const status: Record<string, boolean> = {}
    for (const provider of KEYED_PROVIDERS) {
      status[provider.id] = (provider.env ?? []).some((name) =>
        Boolean(process.env[name]),
      )
    }
    return status
  },
)
```

Next, the key dialog. Copy `src/components/ByokKeyDialog.tsx` from the [ts-react-chat example](https://github.com/TanStack/ai/blob/main/examples/ts-react-chat/src/components/ByokKeyDialog.tsx). It is the same dialog, without the OpenRouter and ChatGPT sign-in buttons and the Cloudflare group card, since this example does not use them. One card per provider, with a badge for your key, a server key, or none. In this example the dialog opens as a native `<dialog>` with `showModal()`, so keyboard focus stays in the dialog until it closes.

Then replace `src/routes/index.tsx`. The page sends microphone PCM up the socket, plays PCM that comes down, and shows captions. Four dropdowns pick the character and the provider per hop, and the key icon opens the dialog. The `start` frame carries the choices and the keys. When the server closes a call with `missing <provider> key`, the page opens the dialog with that provider highlighted.

An `AudioWorklet` turns the microphone's float samples into 16-bit PCM. It runs off the main thread, so the page stays smooth.

```tsx ignore
import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, Phone, PhoneOff } from 'lucide-react'
import { ByokKeyDialog } from '../components/ByokKeyDialog.tsx'
import { byok, getEnvKeyStatus } from '../lib/byok.ts'
import { DEFAULT_CHOICE, HOPS } from '../lib/hops.ts'
import { CHARACTERS, isCharacterName } from '../server/characters.ts'
import type { Choice, Hop } from '../lib/hops.ts'
import type { ProviderId } from '@tanstack/ai/byok'
import type { CharacterName } from '../server/characters.ts'

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

async function startCall(
  character: CharacterName,
  choice: Choice,
  onCaption: (caption: Caption) => void,
  onClose: (reason: string) => void,
) {
  const context = new AudioContext({ sampleRate: 24000 })
  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET], { type: 'text/javascript' }),
  )
  let mic: MediaStream | undefined
  let ws: WebSocket | undefined
  let ended = false
  // Release everything the call holds. Safe to run twice, and safe to run
  // when startup failed halfway.
  const hangUp = () => {
    if (ended) return
    ended = true
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    for (const track of mic?.getTracks() ?? []) track.stop()
    void context.close()
    URL.revokeObjectURL(workletUrl)
  }

  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    await context.audioWorklet.addModule(workletUrl)

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${location.host}/voice`)
    ws = socket
    socket.binaryType = 'arraybuffer'
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () =>
        reject(new Error('Could not open the voice socket'))
    })
  } catch (error) {
    hangUp()
    throw error
  }
  // The server reads the character, the provider per hop, and your keys from
  // this frame. Keys never touch the URL.
  ws.send(
    JSON.stringify({
      type: 'start',
      choice: { character, ...choice },
      headers: byok.headers(),
    }),
  )

  // The server ended the call. A hang-up from the page removes this handler
  // first, so a late close never touches a newer call.
  ws.onclose = (event) => {
    hangUp()
    onClose(event.reason)
  }

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
      )
        return
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
    buffer.copyToChannel(
      Float32Array.from(pcm, (s) => s / 0x8000),
      0,
    )
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    playAt = Math.max(playAt, context.currentTime)
    source.start(playAt)
    playAt += buffer.duration
    playing.add(source)
    source.onended = () => playing.delete(source)
  }

  return hangUp
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
  const [inCall, setInCall] = useState(false)
  const [character, setCharacter] = useState<CharacterName>('perky')
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE)
  const hangUp = useRef<(() => void) | null>(null)
  const starting = useRef(false)
  const mounted = useRef(true)
  const [keysOpen, setKeysOpen] = useState(false)
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>()
  const [missingKey, setMissingKey] = useState<ProviderId | null>(null)
  useEffect(() => {
    void getEnvKeyStatus().then(setEnvStatus)
  }, [])
  // Hang up when the page unmounts, for example on a Fast Refresh remount.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      hangUp.current?.()
    }
  }, [])

  // The server closes with "missing <provider> key" when no key covers a hop.
  const onClose = (reason: string) => {
    const missing = /^missing (\S+) key$/.exec(reason)?.[1]
    hangUp.current = null
    setInCall(false)
    if (missing) {
      setMissingKey(missing)
      setKeysOpen(true)
    }
  }

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
      setInCall(false)
      setCaptions([])
      return
    }
    // A second click while a call starts must not open a second call.
    if (starting.current) return
    starting.current = true
    try {
      setError('')
      const stop = await startCall(character, choice, onCaption, onClose)
      // The page unmounted while the call started.
      if (!mounted.current) return stop()
      hangUp.current = stop
      setInCall(true)
      setCaptions([
        {
          role: 'agent',
          text: 'Connected. Ask me about TanStack AI.',
          final: true,
        },
      ])
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start the call',
      )
    } finally {
      starting.current = false
    }
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <h1 className="text-lg font-semibold">TanStack AI support line</h1>
        <p className="text-sm text-gray-400">
          Talk, then pause. The agent answers from the docs. Talk over it to
          interrupt.
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {captions.map((caption, index) => (
          <div
            key={index}
            className={`rounded-lg p-3 ${
              caption.role === 'agent'
                ? 'bg-linear-to-r from-orange-500/10 to-red-600/10'
                : caption.final
                  ? 'bg-gray-800'
                  : 'bg-gray-800/40 text-gray-400'
            }`}
          >
            <span className="mr-2 text-xs uppercase text-gray-500">
              {caption.role === 'agent' ? 'Agent' : 'You'}
            </span>
            {caption.text}
          </div>
        ))}
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="space-y-3 border-t border-orange-500/10 p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Select
            label="Agent character"
            value={character}
            disabled={inCall}
            options={Object.fromEntries(
              Object.entries(CHARACTERS).map(([name, { label }]) => [
                name,
                label,
              ]),
            )}
            onChange={(next) => {
              if (isCharacterName(next)) setCharacter(next)
            }}
          />
          {(Object.keys(HOPS) as Array<Hop>).map((hop) => (
            <Select
              key={hop}
              label={HOP_LABEL[hop]}
              value={choice[hop]}
              disabled={inCall}
              options={HOPS[hop]}
              onChange={(next) => {
                if (next in HOPS[hop]) {
                  setChoice((current) => ({ ...current, [hop]: next }))
                }
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => void toggleCall()}
            aria-label={inCall ? 'Hang up' : 'Start call'}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${
              inCall
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {inCall ? <PhoneOff size={24} /> : <Phone size={24} />}
          </button>
          <ByokKeyDialog
            open={keysOpen}
            onOpenChange={(open) => {
              setKeysOpen(open)
              if (!open) setMissingKey(null)
            }}
            envStatus={envStatus}
            highlightProvider={missingKey}
            description="Keys stay in your browser and go to the server on the first frame of each call, never stored there. A provider with a server key already works without one."
          />
        </div>
      </div>
    </div>
  )
}

const HOP_LABEL: Record<Hop, string> = {
  listen: 'Listen with',
  think: 'Think with',
  speak: 'Speak with',
}

function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: Record<string, string>
  disabled: boolean
  onChange: (next: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-400">
      {label}
      <span className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-44 appearance-none rounded-lg border border-gray-700 bg-gray-800 pl-3 pr-8 text-sm text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
        >
          {Object.entries(options).map(([name, text]) => (
            <option key={name} value={name}>
              {text}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </span>
    </label>
  )
}

export const Route = createFileRoute('/')({
  component: CallPage,
})
```

`echoCancellation: true` matters. Without it the microphone hears the agent's own voice and barge-in fires on every reply.

Run the app and click Start call. Ask "How do I add a server tool?" and pause. The agent answers from [Server Tools](../tools/server-tools). Talk over it, and it stops.

## 8. Take a phone call

Twilio Media Streams send JSON text frames with base64 G.711 μ-law audio at 8 kHz, and want the same back. Add this carrier to `src/server/carriers.ts`:

- `parseTwilioFrame` checks each field, because anyone can open the socket.
- `streamSid` comes from the `start` frame, which the plugin reads before the call starts.
- `transcriptionSession()` takes the μ-law as is.
- On the way out, `createAudioConverter` resamples the 24 kHz speech to 8 kHz and `toMulaw` encodes it. Each clip gets a new converter, so no samples carry into the next clip.

```typescript ignore
export function twilioCarrier(ws: WebSocket, streamSid: string): Carrier {
  return {
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    audioIn: (data) => {
      const frame = parseTwilioFrame(data)
      return frame?.event === 'media'
        ? Buffer.from(frame.media.payload, 'base64')
        : undefined
    },
    speak: (pcm) => {
      // One converter per clip, so no samples carry into the next clip.
      const toPcm8k = createAudioConverter(PCM_24K, {
        encoding: 'linear16',
        sampleRate: 8000,
      })
      const payload = Buffer.from(toMulaw(toPcm8k(pcm))).toString('base64')
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
    },
    clear: () => ws.send(JSON.stringify({ event: 'clear', streamSid })),
    caption: () => {},
  }
}

type TwilioFrame =
  | {
      event: 'start'
      start: { streamSid: string; customParameters: Record<string, string> }
    }
  | { event: 'media'; media: { payload: string } }

export function parseTwilioFrame(data: RawData): TwilioFrame | undefined {
  let frame: unknown
  try {
    frame = JSON.parse(toBytes(data).toString())
  } catch {
    return undefined
  }
  if (typeof frame !== 'object' || frame === null || !('event' in frame)) {
    return undefined
  }
  if (frame.event === 'media' && 'media' in frame) {
    const { media } = frame
    if (
      typeof media === 'object' &&
      media !== null &&
      'payload' in media &&
      typeof media.payload === 'string'
    ) {
      return { event: 'media', media: { payload: media.payload } }
    }
  }
  if (frame.event === 'start' && 'start' in frame) {
    const { start } = frame
    if (
      typeof start === 'object' &&
      start !== null &&
      'streamSid' in start &&
      typeof start.streamSid === 'string'
    ) {
      const params =
        'customParameters' in start ? start.customParameters : undefined
      return {
        event: 'start',
        start: {
          streamSid: start.streamSid,
          customParameters: isStringRecord(params) ? params : {},
        },
      }
    }
  }
  return undefined
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

1. Add `TWILIO_STREAM_TOKEN` to `.env.local` with a long random value, and restart the dev server.
2. Run `ngrok http 3100` and copy the `https` host.
3. In the Twilio console, set the number's voice webhook to return this TwiML:

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR-NGROK-HOST/twilio">
      <Parameter name="token" value="YOUR-TWILIO-STREAM-TOKEN" />
      <Parameter name="character" value="startup" />
      <Parameter name="think" value="gemini" />
    </Stream>
  </Connect>
</Response>
```

4. Call the number and ask a question. The `<Parameter>` names are `token`, `character`, `listen`, `think`, and `speak`. Leave out a hop or the character for the default.

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
