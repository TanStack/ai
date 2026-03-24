import type {
  DallE2ProviderOptions,
  DallE3ProviderOptions,
  GptImage1MiniProviderOptions,
  GptImage1ProviderOptions,
} from '../image/image-provider-options'
import type { OpenAIRegistryDocs } from './shared'

interface ImageModelSpec<
  TProviderOptions,
  TSize extends string,
  TInput extends ReadonlyArray<'text' | 'image'>,
> {
  input: TInput
  output: readonly ['image']
  providerOptions: TProviderOptions
  sizes: ReadonlyArray<TSize>
  supportsBackground?: boolean
  maxImages: number
  maxPromptLength: number
  snapshots?: ReadonlyArray<string>
  lifecycle: {
    status: 'active' | 'deprecated' | 'legacy' | 'chatgpt_only'
    replacedBy?: string
  }
  docs?: OpenAIRegistryDocs
}

export const IMAGE_MODELS = {
  'gpt-image-1.5': {
    input: ['text', 'image'],
    output: ['image'],
    providerOptions: {} as GptImage1ProviderOptions,
    sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    supportsBackground: true,
    maxImages: 10,
    maxPromptLength: 32000,
    snapshots: ['gpt-image-1.5-2025-12-16'],
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/gpt-image-1.5',
      billing: {
        text: {
          input: 5,
          cachedInput: 1.25,
          output: 10,
        },
        image: {
          input: 8,
          cachedInput: 2,
          output: 32,
        },
      },
    },
  },
  'chatgpt-image-latest': {
    input: ['text', 'image'],
    output: ['image'],
    providerOptions: {} as GptImage1ProviderOptions,
    sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    supportsBackground: true,
    maxImages: 10,
    maxPromptLength: 32000,
    lifecycle: { status: 'active' },
    docs: {
      source: 'https://developers.openai.com/api/docs/models/chatgpt-image-latest',
      notes: ['Points to the image snapshot currently used in ChatGPT.'],
      billing: {
        text: {
          input: 5,
          cachedInput: 1.25,
          output: 10,
        },
        image: {
          input: 8,
          cachedInput: 2,
          output: 32,
        },
      },
    },
  },
  'gpt-image-1': {
    input: ['text', 'image'],
    output: ['image'],
    providerOptions: {} as GptImage1ProviderOptions,
    sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    supportsBackground: true,
    maxImages: 10,
    maxPromptLength: 32000,
    lifecycle: { status: 'legacy', replacedBy: 'gpt-image-1.5' },
  },
  'gpt-image-1-mini': {
    input: ['text', 'image'],
    output: ['image'],
    providerOptions: {} as GptImage1MiniProviderOptions,
    sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    supportsBackground: true,
    maxImages: 10,
    maxPromptLength: 32000,
    lifecycle: { status: 'active' },
  },
  'dall-e-3': {
    input: ['text'],
    output: ['image'],
    providerOptions: {} as DallE3ProviderOptions,
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    maxImages: 1,
    maxPromptLength: 4000,
    lifecycle: { status: 'deprecated', replacedBy: 'gpt-image-1.5' },
  },
  'dall-e-2': {
    input: ['text'],
    output: ['image'],
    providerOptions: {} as DallE2ProviderOptions,
    sizes: ['256x256', '512x512', '1024x1024'],
    maxImages: 10,
    maxPromptLength: 1000,
    lifecycle: { status: 'deprecated', replacedBy: 'gpt-image-1.5' },
  },
} as const satisfies Record<
  string,
  ImageModelSpec<unknown, string, ReadonlyArray<'text' | 'image'>>
>
