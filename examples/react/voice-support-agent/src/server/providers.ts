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

/** Words the transcriber should expect on this call. */
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

/** Start a transcription session. Each provider has its own options. */
export type Listen = (
  audio: LiveAudioFormat,
  abortSignal: AbortSignal,
) => Promise<TranscriptionSession>

/** Stream a reply. */
export type Think = (args: {
  messages: Array<ModelMessage>
  systemPrompts: Array<string>
  tools: Array<AnyTool>
  threadId: string
  abortController: AbortController
}) => AsyncIterable<StreamChunk>

/** Say one sentence as 24 kHz 16-bit mono PCM. */
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
        // Gemini wants a BCP-47 tag. SMART drops fillers and false starts.
        language: 'en-US',
        modelOptions: { customVocabulary: VOCABULARY, mode: 'SMART' },
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

/** The PCM inside a RIFF/WAV file. */
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

/**
 * Turn the caller's choices and keys into one call setup. `headers` carries
 * the `x-byok-<provider>` headers from the page. A hop with no header falls
 * back to the provider's env var, which is how the Twilio path gets its keys.
 * Returns the provider that has no key at all, so the caller can say so.
 */
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
