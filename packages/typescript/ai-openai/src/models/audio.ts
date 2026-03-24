import type { OpenAIRegistryDocs } from './shared'

interface TTSModelSpec {
  input: readonly ['text']
  output: readonly ['audio']
  snapshots?: ReadonlyArray<string>
  lifecycle: {
    status: 'active' | 'legacy'
    replacedBy?: string
  }
  supportsStreaming: boolean
  supportsInstructions: boolean
  docs?: OpenAIRegistryDocs
}

interface TranscriptionModelSpec {
  input: readonly ['audio', 'text']
  output: readonly ['text']
  snapshots?: ReadonlyArray<string>
  lifecycle: {
    status: 'active' | 'legacy'
    replacedBy?: string
  }
  supportsLogprobs: boolean
  supportsDiarization: boolean
  docs?: OpenAIRegistryDocs
}

interface RealtimeModelSpec {
  input: readonly ['text', 'audio', 'image']
  output: readonly ['text', 'audio']
  snapshots?: ReadonlyArray<string>
  lifecycle: {
    status: 'active' | 'preview' | 'deprecated' | 'legacy'
    replacedBy?: string
  }
  docs?: OpenAIRegistryDocs
}

export const TTS_MODELS = {
  'gpt-4o-mini-tts': {
    input: ['text'],
    output: ['audio'],
    lifecycle: { status: 'active' },
    supportsStreaming: true,
    supportsInstructions: true,
    snapshots: ['gpt-4o-mini-tts-2025-12-15', 'gpt-4o-mini-tts-2025-03-20'],
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-mini-tts',
      billing: { input: 0.6, output: 12 },
    },
  },
  'tts-1': {
    input: ['text'],
    output: ['audio'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4o-mini-tts' },
    supportsStreaming: false,
    supportsInstructions: false,
  },
  'tts-1-hd': {
    input: ['text'],
    output: ['audio'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4o-mini-tts' },
    supportsStreaming: false,
    supportsInstructions: false,
  },
} as const satisfies Record<string, TTSModelSpec>

export const TRANSCRIPTION_MODELS = {
  'whisper-1': {
    input: ['audio', 'text'],
    output: ['text'],
    lifecycle: { status: 'legacy', replacedBy: 'gpt-4o-transcribe' },
    supportsLogprobs: false,
    supportsDiarization: false,
    docs: {
      source: 'https://developers.openai.com/api/docs/models/whisper-1',
    },
  },
  'gpt-4o-transcribe': {
    input: ['audio', 'text'],
    output: ['text'],
    lifecycle: { status: 'active' },
    supportsLogprobs: true,
    supportsDiarization: false,
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-transcribe',
    },
  },
  'gpt-4o-mini-transcribe': {
    input: ['audio', 'text'],
    output: ['text'],
    lifecycle: { status: 'active' },
    supportsLogprobs: true,
    supportsDiarization: false,
    snapshots: [
      'gpt-4o-mini-transcribe-2025-12-15',
      'gpt-4o-mini-transcribe-2025-03-20',
    ],
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe',
    },
  },
  'gpt-4o-transcribe-diarize': {
    input: ['audio', 'text'],
    output: ['text'],
    lifecycle: { status: 'active' },
    supportsLogprobs: false,
    supportsDiarization: true,
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize',
    },
  },
} as const satisfies Record<string, TranscriptionModelSpec>

export const REALTIME_MODELS = {
  'gpt-realtime-1.5': {
    input: ['text', 'audio', 'image'],
    output: ['text', 'audio'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-realtime-1.5',
      limits: {
        contextWindow: 32_768,
        maxOutputTokens: 4_096,
        knowledgeCutoff: '2024-06-01',
      },
      billing: {
        audio: {
          input: 4,
          cachedInput: 0.4,
          output: 16,
        },
      },
    },
  },
  'gpt-realtime': {
    input: ['text', 'audio', 'image'],
    output: ['text', 'audio'],
    snapshots: ['gpt-realtime-2025-08-28'],
    lifecycle: { status: 'active' },
  },
  'gpt-realtime-mini': {
    input: ['text', 'audio', 'image'],
    output: ['text', 'audio'],
    snapshots: ['gpt-realtime-mini-2025-12-15', 'gpt-realtime-mini-2025-10-06'],
    lifecycle: { status: 'active' },
  },
  'gpt-4o-realtime-preview': {
    input: ['text', 'audio', 'image'],
    output: ['text', 'audio'],
    snapshots: [
      'gpt-4o-realtime-preview-2025-06-03',
      'gpt-4o-realtime-preview-2024-12-17',
      'gpt-4o-realtime-preview-2024-10-01',
    ],
    lifecycle: { status: 'preview' },
  },
  'gpt-4o-mini-realtime-preview': {
    input: ['text', 'audio', 'image'],
    output: ['text', 'audio'],
    snapshots: ['gpt-4o-mini-realtime-preview-2024-12-17'],
    lifecycle: { status: 'preview' },
  },
} as const satisfies Record<string, RealtimeModelSpec>
