import type {
  OpenAIVideoProviderOptions,
  OpenAIVideoSeconds,
  OpenAIVideoSize,
} from '../video/video-provider-options'
import type { OpenAIRegistryDocs } from './shared'

interface VideoModelSpec {
  input: readonly ['text', 'image']
  output: readonly ['video', 'audio']
  providerOptions: OpenAIVideoProviderOptions
  sizes: ReadonlyArray<OpenAIVideoSize>
  durations: ReadonlyArray<OpenAIVideoSeconds>
  snapshots?: ReadonlyArray<string>
  lifecycle: {
    status: 'active'
  }
  docs?: OpenAIRegistryDocs
}

const VIDEO_SIZES = [
  '1280x720',
  '720x1280',
  '1792x1024',
  '1024x1792',
] as const satisfies ReadonlyArray<OpenAIVideoSize>

const VIDEO_DURATIONS = ['4', '8', '12'] as const satisfies ReadonlyArray<OpenAIVideoSeconds>

export const VIDEO_MODELS = {
  'sora-2': {
    input: ['text', 'image'],
    output: ['video', 'audio'],
    providerOptions: {},
    sizes: VIDEO_SIZES,
    durations: VIDEO_DURATIONS,
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/sora-2',
      billing: { output: 0.1 },
    },
  },
  'sora-2-pro': {
    input: ['text', 'image'],
    output: ['video', 'audio'],
    providerOptions: {},
    sizes: VIDEO_SIZES,
    durations: VIDEO_DURATIONS,
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/sora-2-pro',
      billing: { output: 0.5 },
    },
  },
} as const satisfies Record<string, VideoModelSpec>
