import {
  createOpenaiImage,
  createOpenaiSpeech,
  createOpenaiTranscription,
  createOpenaiVideo,
} from '@tanstack/ai-openai'
import {
  createGeminiAudio,
  createGeminiImage,
  createGeminiSpeech,
  createGeminiVideo,
} from '@tanstack/ai-gemini'
import {
  createGrokImage,
  createGrokSpeech,
  createGrokTranscription,
} from '@tanstack/ai-grok'
import { createGroqTranscription } from '@tanstack/ai-groq'
import {
  createElevenLabsAudio,
  createElevenLabsSpeech,
  createElevenLabsTranscription,
} from '@tanstack/ai-elevenlabs'
import {
  createBytePlusImage,
  createBytePlusSpeech,
  createBytePlusTranscription,
  createBytePlusVideo,
} from '@tanstack/ai-byteplus'
import { createVercelGatewayImage } from '@tanstack/ai-vercel-gateway'
import type { TranscriptionResponseFormat } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

type TranscriptionAdapterOptions = {
  responseFormat?: TranscriptionResponseFormat
  modelOptions?: Record<string, any>
}

function llmockBase(aimockPort?: number): string {
  if (aimockPort) return `http://127.0.0.1:${aimockPort}`
  return LLMOCK_DEFAULT_BASE
}

function openaiUrl(aimockPort?: number): string {
  return `${llmockBase(aimockPort)}/v1`
}

/**
 * BytePlus Ark (chat, Seedream image, Seedance video) serves its data plane
 * under `/api/v3`. The Seed Speech adapters (TTS/ASR) are *not* on Ark — they
 * take the bare host and append `/api/v3/...` themselves, so they get
 * `llmockBase()` instead.
 */
function bytePlusArkUrl(aimockPort?: number): string {
  return `${llmockBase(aimockPort)}/api/v3`
}

function testHeaders(testId?: string): Record<string, string> | undefined {
  return testId ? { 'X-Test-Id': testId } : undefined
}

function getOpenaiTranscriptionModel(options: TranscriptionAdapterOptions) {
  const modelOptions = options.modelOptions
  const isDiarizationRequest =
    modelOptions?.response_format === 'diarized_json' ||
    modelOptions?.chunking_strategy !== undefined ||
    modelOptions?.known_speaker_names !== undefined ||
    modelOptions?.known_speaker_references !== undefined

  return isDiarizationRequest ? 'gpt-4o-transcribe-diarize' : 'whisper-1'
}

export function createImageAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiImage('gpt-image-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      createGeminiImage('gemini-2.5-flash-image', DUMMY_KEY, {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      }),
    grok: () =>
      createGrokImage('grok-2-image-1212', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    // Seedream posts a non-OpenAI body (`size` as a 1K/2K token, no `n`,
    // `watermark`, `sequential_image_generation`) to /images/generations, but
    // aimock's native handler only reads `model` + `prompt` and answers with
    // the shared `{ created, data: [{ url }] }` envelope Seedream also uses —
    // so the Ark path needs no mount of its own.
    // seedream-4-0-250828 deliberately: it's the one Seedream model whose
    // response shape was captured from a live call during Phase 0.
    byteplus: () =>
      createBytePlusImage('seedream-4-0-250828', DUMMY_KEY, {
        baseURL: bytePlusArkUrl(aimockPort),
        defaultHeaders: headers,
      }),
    'vercel-gateway': () =>
      createVercelGatewayImage('openai/gpt-image-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No image adapter for provider: ${provider}`)
  return factory()
}

export function createTTSAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiSpeech('tts-1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      createGeminiSpeech('gemini-3.1-flash-tts-preview', DUMMY_KEY, {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      }),
    grok: () =>
      createGrokSpeech('grok-tts', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    elevenlabs: () =>
      createElevenLabsSpeech('eleven_multilingual_v2', DUMMY_KEY, {
        baseUrl: llmockBase(aimockPort),
        headers,
      }),
    // Seed Speech is a separate BytePlus product from Ark with its own key and
    // its own host, so this takes the bare mock base — the adapter appends
    // `/api/v3/tts/create`, which `byteplusTTSMount()` serves.
    byteplus: () =>
      createBytePlusSpeech('seed-audio-1.0', DUMMY_KEY, {
        baseURL: llmockBase(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No TTS adapter for provider: ${provider}`)
  return factory()
}

export function createTranscriptionAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
  options: TranscriptionAdapterOptions = {},
) {
  const headers = testHeaders(testId)
  const openaiTranscriptionModel = getOpenaiTranscriptionModel(options)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiTranscription(openaiTranscriptionModel, DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    grok: () =>
      createGrokTranscription('grok-stt', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    groq: () =>
      createGroqTranscription('whisper-large-v3-turbo', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    elevenlabs: () =>
      createElevenLabsTranscription('scribe_v1', DUMMY_KEY, {
        baseUrl: llmockBase(aimockPort),
        headers,
      }),
    // Same Seed Speech host as the TTS adapter above; the adapter appends
    // `/api/v3/auc/bigmodel/recognize/flash`, served by `byteplusASRMount()`.
    byteplus: () =>
      createBytePlusTranscription('seed-asr', DUMMY_KEY, {
        baseURL: llmockBase(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory)
    throw new Error(`No transcription adapter for provider: ${provider}`)
  return factory()
}

export function createVideoAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
  feature: Feature = 'video-gen',
) {
  const headers = testHeaders(testId)
  // Gemini Omni Flash only serves the Interactions API; its background
  // video jobs run through a dedicated aimock mount (see geminiOmniVideoMount
  // in global-setup.ts) addressed via a distinct baseUrl prefix so aimock's
  // native /v1beta/interactions text handling is untouched. The video-edit
  // feature reuses the same mount for Gemini (previousJobId chains
  // previous_interaction_id); OpenAI video-edit falls through to the Sora
  // adapter below (remix rides the openaiVideoRemixMount).
  if (
    feature === 'interactions-video' ||
    (feature === 'video-edit' && provider === 'gemini')
  ) {
    if (provider !== 'gemini') {
      throw new Error(`No interactions-video adapter for provider: ${provider}`)
    }
    return createGeminiVideo('gemini-omni-flash-preview', DUMMY_KEY, {
      httpOptions: { baseUrl: `${llmockBase(aimockPort)}/omni-video`, headers },
    })
  }
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiVideo('sora-2', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      // `httpOptions` is a valid inherited `GoogleGenAIOptions` key (image/audio
      // pass it the same way), but `GeminiVideoConfig`'s own `allowUrlFetch`
      // member makes tsc drop the inherited keys from `Omit<…, 'apiKey'>`, so
      // the literal is rejected here only. Cast to the param type — the mock
      // base URL is required at runtime.
      createGeminiVideo('veo-3.1-generate-preview', DUMMY_KEY, {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      } as unknown as Parameters<typeof createGeminiVideo>[2]),
    // Seedance's create→poll task API has no aimock equivalent, so it runs
    // through `byteplusSeedanceMount()` on the Ark prefix.
    byteplus: () =>
      createBytePlusVideo('seedance-1-0-pro-fast-251015', DUMMY_KEY, {
        baseURL: bytePlusArkUrl(aimockPort),
        defaultHeaders: headers,
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No video adapter for provider: ${provider}`)
  return factory()
}

export function createAudioAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
  feature: Feature = 'audio-gen',
) {
  const headers = testHeaders(testId)
  const base = llmockBase(aimockPort)
  if (provider === 'elevenlabs') {
    if (feature === 'sound-effects') {
      return createElevenLabsAudio('eleven_text_to_sound_v2', DUMMY_KEY, {
        baseUrl: base,
        headers,
      })
    }
    return createElevenLabsAudio('music_v1', DUMMY_KEY, {
      baseUrl: base,
      headers,
    })
  }
  const factories: Record<string, () => any> = {
    gemini: () =>
      createGeminiAudio('lyria-3-clip-preview', DUMMY_KEY, {
        httpOptions: { baseUrl: base, headers },
      }),
  }
  const factory = factories[provider]
  if (!factory) throw new Error(`No audio adapter for provider: ${provider}`)
  return factory()
}
