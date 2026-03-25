import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  IMAGE_MODELS,
  TEXT_MODELS,
  VIDEO_MODELS,
} from '../src/models'
import {
  REALTIME_MODELS,
  TRANSCRIPTION_MODELS,
  TTS_MODELS,
} from '../src/models/audio'
import {
  idsByStatus,
  snapshotIds,
  supportedIds,
  type RegistryModelId,
} from '../src/models/shared'
import {
  OPENAI_CHAT_MODELS,
  OPENAI_CHAT_SNAPSHOT_MODELS,
  OPENAI_CURRENT_CHAT_MODELS,
  OPENAI_CURRENT_IMAGE_MODELS,
  OPENAI_PREVIEW_CHAT_MODELS,
  OPENAI_CURRENT_TRANSCRIPTION_MODELS,
  OPENAI_CURRENT_TTS_MODELS,
  OPENAI_CURRENT_VIDEO_MODELS,
  OPENAI_DEPRECATED_CHAT_MODELS,
  OPENAI_IMAGE_MODELS,
  OPENAI_IMAGE_SNAPSHOT_MODELS,
  OPENAI_REALTIME_MODELS,
  OPENAI_REALTIME_SNAPSHOT_MODELS,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_SNAPSHOT_MODELS,
  OPENAI_VIDEO_MODELS,
  type OpenAIChatModel,
  type OpenAIChatModelProviderOptionsByName,
  type OpenAIImageModelProviderOptionsByName,
  type OpenAIImageModelSizeByName,
  type OpenAIModelInputModalitiesByName,
  type OpenAIRealtimeModel,
  type OpenAITTSModel,
  type OpenAITranscriptionModel,
  type OpenAIVideoModel,
  type OpenAIVideoModelProviderOptionsByName,
  type OpenAIVideoModelSizeByName,
} from '../src/model-meta'
import type {
  DallE3ProviderOptions,
  GptImage1ProviderOptions,
} from '../src/image/image-provider-options'
import type {
  OpenAIReasoningOptionsWithConcise,
  OpenAIStreamingOptions,
  OpenAIStructuredOutputOptions,
  OpenAIToolsOptions,
} from '../src/text/text-provider-options'
import type {
  OpenAIVideoProviderOptions,
  OpenAIVideoSize,
} from '../src/video/video-provider-options'

describe('OpenAI registries', () => {
  const expectUnique = (ids: ReadonlyArray<string>) => {
    expect(new Set(ids).size).toBe(ids.length)
  }
  const hasOwn = (object: object, key: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(object, key)

  it('derives public arrays from the keyed registries', () => {
    expect(OPENAI_CHAT_MODELS).toEqual(supportedIds(TEXT_MODELS))
    expect(OPENAI_IMAGE_MODELS).toEqual(supportedIds(IMAGE_MODELS))
    expect(OPENAI_VIDEO_MODELS).toEqual(supportedIds(VIDEO_MODELS))
    expect(OPENAI_TTS_MODELS).toEqual(supportedIds(TTS_MODELS))
    expect(OPENAI_TRANSCRIPTION_MODELS).toEqual(supportedIds(TRANSCRIPTION_MODELS))
    expect(OPENAI_REALTIME_MODELS).toEqual(supportedIds(REALTIME_MODELS))
  })

  it('derives filtered arrays from lifecycle state', () => {
    expect(OPENAI_CURRENT_CHAT_MODELS).toEqual(idsByStatus(TEXT_MODELS, 'active'))
    expect(OPENAI_DEPRECATED_CHAT_MODELS).toEqual(
      idsByStatus(TEXT_MODELS, 'deprecated'),
    )
    expect(OPENAI_PREVIEW_CHAT_MODELS).toEqual(idsByStatus(TEXT_MODELS, 'preview'))
    expect(OPENAI_CURRENT_IMAGE_MODELS).toEqual(idsByStatus(IMAGE_MODELS, 'active'))
    expect(OPENAI_CURRENT_VIDEO_MODELS).toEqual(idsByStatus(VIDEO_MODELS, 'active'))
    expect(OPENAI_CURRENT_TTS_MODELS).toEqual(idsByStatus(TTS_MODELS, 'active'))
    expect(OPENAI_CURRENT_TRANSCRIPTION_MODELS).toEqual(
      idsByStatus(TRANSCRIPTION_MODELS, 'active'),
    )
  })

  it('surfaces snapshot ids from the registries', () => {
    expect(OPENAI_CHAT_SNAPSHOT_MODELS).toEqual(snapshotIds(TEXT_MODELS))
    expect(OPENAI_IMAGE_SNAPSHOT_MODELS).toEqual(snapshotIds(IMAGE_MODELS))
    expect(OPENAI_TTS_SNAPSHOT_MODELS).toEqual(snapshotIds(TTS_MODELS))
    expect(OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS).toEqual(
      snapshotIds(TRANSCRIPTION_MODELS),
    )
    for (const id of OPENAI_CHAT_SNAPSHOT_MODELS) {
      expect(OPENAI_CHAT_MODELS).toContain(id)
      expect(hasOwn(TEXT_MODELS, id)).toBe(false)
    }
    for (const id of OPENAI_IMAGE_SNAPSHOT_MODELS) {
      expect(OPENAI_IMAGE_MODELS).toContain(id)
      expect(hasOwn(IMAGE_MODELS, id)).toBe(false)
    }
    for (const id of OPENAI_TTS_SNAPSHOT_MODELS) {
      expect(OPENAI_TTS_MODELS).toContain(id)
      expect(hasOwn(TTS_MODELS, id)).toBe(false)
    }
    for (const id of OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS) {
      expect(OPENAI_TRANSCRIPTION_MODELS).toContain(id)
      expect(hasOwn(TRANSCRIPTION_MODELS, id)).toBe(false)
    }
  })

  it('exports deduplicated model lists', () => {
    expectUnique(OPENAI_CHAT_MODELS)
    expectUnique(OPENAI_CHAT_SNAPSHOT_MODELS)
    expectUnique(OPENAI_IMAGE_MODELS)
    expectUnique(OPENAI_IMAGE_SNAPSHOT_MODELS)
    expectUnique(OPENAI_VIDEO_MODELS)
    expectUnique(OPENAI_TTS_MODELS)
    expectUnique(OPENAI_TTS_SNAPSHOT_MODELS)
    expectUnique(OPENAI_TRANSCRIPTION_MODELS)
    expectUnique(OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS)
    expectUnique(OPENAI_REALTIME_MODELS)
    expectUnique(OPENAI_REALTIME_SNAPSHOT_MODELS)
  })

  it('keeps dead aliases out of the text union', () => {
    expect(OPENAI_CHAT_MODELS).not.toContain('chatgpt-4o-latest')
    expect(OPENAI_CHAT_MODELS).not.toContain('codex-mini-latest')
  })

  it('keeps codex outputs text-only in the registry', () => {
    expect(TEXT_MODELS['gpt-5.3-codex'].output).toEqual(['text'])
    expect(TEXT_MODELS['gpt-5.1-codex'].output).toEqual(['text'])
    expect(TEXT_MODELS['gpt-5-codex'].output).toEqual(['text'])
  })

  it('keeps audio chat models tool-capable in the feature map', () => {
    type Audio15Options = OpenAIChatModelProviderOptionsByName['gpt-audio-1.5']
    type Audio4oOptions =
      OpenAIChatModelProviderOptionsByName['gpt-4o-audio-preview']
    type Audio15HasStreaming = Extract<keyof Audio15Options, 'stream_options'>
    type Audio4oHasStreaming = Extract<keyof Audio4oOptions, 'stream_options'>

    expectTypeOf<Audio15Options>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<Audio4oOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<Audio15HasStreaming>().toEqualTypeOf<never>()
    expectTypeOf<Audio4oHasStreaming>().toEqualTypeOf<'stream_options'>()
  })

  it('keeps gpt-5.4 and computer-use-preview on the intended feature sets', () => {
    type GPT54Options = OpenAIChatModelProviderOptionsByName['gpt-5.4']
    type GPT54HasReasoning = Extract<keyof GPT54Options, 'reasoning'>
    type GPT53ChatOptions =
      OpenAIChatModelProviderOptionsByName['gpt-5.3-chat-latest']
    type GPT53ChatHasReasoning = Extract<keyof GPT53ChatOptions, 'reasoning'>
    type GPT5ProOptions = OpenAIChatModelProviderOptionsByName['gpt-5-pro']
    type GPT41Options = OpenAIChatModelProviderOptionsByName['gpt-4.1']
    type GPT41HasReasoning = Extract<keyof GPT41Options, 'reasoning'>
    type GPT4TurboOptions = OpenAIChatModelProviderOptionsByName['gpt-4-turbo']
    type GPT35TurboOptions =
      OpenAIChatModelProviderOptionsByName['gpt-3.5-turbo']
    type SearchPreviewOptions =
      OpenAIChatModelProviderOptionsByName['gpt-4o-search-preview']
    type O1MiniOptions = OpenAIChatModelProviderOptionsByName['o1-mini']
    type O1MiniHasReasoning = Extract<keyof O1MiniOptions, 'reasoning'>
    type O3ProOptions = OpenAIChatModelProviderOptionsByName['o3-pro']
    type O3ProHasReasoning = Extract<keyof O3ProOptions, 'reasoning'>
    type ComputerUseOptions =
      OpenAIChatModelProviderOptionsByName['computer-use-preview']
    type ComputerUseHasReasoning = Extract<keyof ComputerUseOptions, 'reasoning'>

    expectTypeOf<GPT54HasReasoning>().toEqualTypeOf<'reasoning'>()
    expectTypeOf<GPT54Options>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT54Options>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT53ChatHasReasoning>().toEqualTypeOf<never>()
    expectTypeOf<GPT53ChatOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT53ChatOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT5ProOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT41HasReasoning>().toEqualTypeOf<never>()
    expectTypeOf<GPT41Options>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT41Options>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT4TurboOptions>().not.toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT4TurboOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT35TurboOptions>().not.toExtend<OpenAIStreamingOptions>()
    expectTypeOf<GPT35TurboOptions>().not.toExtend<OpenAIToolsOptions>()
    expectTypeOf<SearchPreviewOptions>().toExtend<
      OpenAIStructuredOutputOptions
    >()
    expectTypeOf<SearchPreviewOptions>().not.toExtend<OpenAIToolsOptions>()
    expectTypeOf<O1MiniHasReasoning>().toEqualTypeOf<'reasoning'>()
    expectTypeOf<O1MiniOptions>().not.toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<O1MiniOptions>().not.toExtend<OpenAIToolsOptions>()
    expectTypeOf<O3ProHasReasoning>().toEqualTypeOf<'reasoning'>()
    expectTypeOf<O3ProOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<O3ProOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<O3ProOptions>().not.toExtend<OpenAIStreamingOptions>()
    expectTypeOf<ComputerUseHasReasoning>().toEqualTypeOf<'reasoning'>()
    expectTypeOf<ComputerUseOptions>().toExtend<OpenAIReasoningOptionsWithConcise>()
    expectTypeOf<ComputerUseOptions>().not.toExtend<OpenAIStreamingOptions>()
  })

  it('keeps reasoning effort and summary unions exact per model', () => {
    type GPT51Effort = NonNullable<
      NonNullable<OpenAIChatModelProviderOptionsByName['gpt-5.1']['reasoning']>['effort']
    >
    type GPT5Effort = NonNullable<
      NonNullable<OpenAIChatModelProviderOptionsByName['gpt-5']['reasoning']>['effort']
    >
    type GPT5ProEffort = NonNullable<
      NonNullable<OpenAIChatModelProviderOptionsByName['gpt-5-pro']['reasoning']>['effort']
    >
    type GPT54ProEffort = NonNullable<
      NonNullable<
        OpenAIChatModelProviderOptionsByName['gpt-5.4-pro']['reasoning']
      >['effort']
    >
    type GPT52ProEffort = NonNullable<
      NonNullable<
        OpenAIChatModelProviderOptionsByName['gpt-5.2-pro']['reasoning']
      >['effort']
    >
    type ComputerUseSummary = NonNullable<
      NonNullable<
        OpenAIChatModelProviderOptionsByName['computer-use-preview']['reasoning']
      >['summary']
    >
    type GPT54Summary = NonNullable<
      NonNullable<OpenAIChatModelProviderOptionsByName['gpt-5.4']['reasoning']>['summary']
    >

    expectTypeOf<GPT51Effort>().toEqualTypeOf<'none' | 'low' | 'medium' | 'high'>()
    expectTypeOf<GPT5Effort>().toEqualTypeOf<
      'minimal' | 'low' | 'medium' | 'high'
    >()
    expectTypeOf<GPT5ProEffort>().toEqualTypeOf<'high'>()
    expectTypeOf<GPT54ProEffort>().toEqualTypeOf<'medium' | 'high' | 'xhigh'>()
    expectTypeOf<GPT52ProEffort>().toEqualTypeOf<'medium' | 'high' | 'xhigh'>()
    expectTypeOf<ComputerUseSummary>().toEqualTypeOf<
      'auto' | 'detailed' | 'concise'
    >()
    expectTypeOf<GPT54Summary>().toEqualTypeOf<'auto' | 'detailed'>()
  })

  it('derives modalities and size maps from the registries', () => {
    type TextIds = RegistryModelId<typeof TEXT_MODELS>
    type ImageIds = RegistryModelId<typeof IMAGE_MODELS>
    type VideoIds = RegistryModelId<typeof VIDEO_MODELS>
    type TTSIds = RegistryModelId<typeof TTS_MODELS>
    type TranscriptionIds = RegistryModelId<typeof TRANSCRIPTION_MODELS>

    expectTypeOf<OpenAIChatModel>().toEqualTypeOf<TextIds>()
    expectTypeOf<keyof OpenAIChatModelProviderOptionsByName>().toEqualTypeOf<TextIds>()
    expectTypeOf<keyof OpenAIModelInputModalitiesByName>().toEqualTypeOf<TextIds>()
    expectTypeOf<OpenAITTSModel>().toEqualTypeOf<TTSIds>()
    expectTypeOf<OpenAITranscriptionModel>().toEqualTypeOf<TranscriptionIds>()
    expectTypeOf<OpenAIVideoModel>().toEqualTypeOf<VideoIds>()
    expectTypeOf<keyof OpenAIImageModelProviderOptionsByName>().toEqualTypeOf<
      ImageIds
    >()
    expectTypeOf<keyof OpenAIImageModelSizeByName>().toEqualTypeOf<ImageIds>()
    expectTypeOf<keyof OpenAIVideoModelProviderOptionsByName>().toEqualTypeOf<
      VideoIds
    >()
    expectTypeOf<keyof OpenAIVideoModelSizeByName>().toEqualTypeOf<VideoIds>()
  })

  it('keeps modality spot checks on the registry-backed maps', () => {
    type GPT54Modalities = OpenAIModelInputModalitiesByName['gpt-5.4']
    type Audio15Modalities = OpenAIModelInputModalitiesByName['gpt-audio-1.5']
    type ImageSizes = OpenAIImageModelSizeByName['gpt-image-1.5']
    type Sora2Sizes = OpenAIVideoModelSizeByName['sora-2']
    type O1PreviewModalities = OpenAIModelInputModalitiesByName['o1-preview']
    type O1MiniModalities = OpenAIModelInputModalitiesByName['o1-mini']
    type O3MiniModalities = OpenAIModelInputModalitiesByName['o3-mini']
    type GPTImageOptions = OpenAIImageModelProviderOptionsByName['gpt-image-1.5']
    type DallE3Options = OpenAIImageModelProviderOptionsByName['dall-e-3']
    type Sora2Options = OpenAIVideoModelProviderOptionsByName['sora-2']

    expectTypeOf<GPT54Modalities>().toEqualTypeOf<readonly ['text', 'image']>()
    expectTypeOf<Audio15Modalities>().toEqualTypeOf<
      readonly ['text', 'audio']
    >()
    expectTypeOf<O1PreviewModalities>().toEqualTypeOf<readonly ['text']>()
    expectTypeOf<O1MiniModalities>().toEqualTypeOf<readonly ['text']>()
    expectTypeOf<O3MiniModalities>().toEqualTypeOf<readonly ['text']>()
    expectTypeOf<ImageSizes>().toEqualTypeOf<
      '1024x1024' | '1536x1024' | '1024x1536' | 'auto'
    >()
    expectTypeOf<Sora2Sizes>().toEqualTypeOf<OpenAIVideoSize>()
    expectTypeOf<GPTImageOptions>().toEqualTypeOf<GptImage1ProviderOptions>()
    expectTypeOf<DallE3Options>().toEqualTypeOf<DallE3ProviderOptions>()
    expectTypeOf<Sora2Options>().toEqualTypeOf<OpenAIVideoProviderOptions>()
  })

  it('widens the realtime union with supported snapshot-style ids', () => {
    type RealtimeIds = RegistryModelId<typeof REALTIME_MODELS>

    expectTypeOf<OpenAIRealtimeModel>().toEqualTypeOf<RealtimeIds>()
    expectTypeOf<'gpt-realtime-1.5'>().toExtend<OpenAIRealtimeModel>()
    expect(OPENAI_REALTIME_MODELS).toEqual(supportedIds(REALTIME_MODELS))
    expect(OPENAI_REALTIME_SNAPSHOT_MODELS).toEqual(snapshotIds(REALTIME_MODELS))
    for (const id of OPENAI_REALTIME_SNAPSHOT_MODELS) {
      expect(OPENAI_REALTIME_MODELS).toContain(id)
      expect(hasOwn(REALTIME_MODELS, id)).toBe(false)
    }
    }
    expect(OPENAI_REALTIME_MODELS).not.toContain('gpt-4o-realtime')
  })

  it('keeps a few anchor ids on the expected public surfaces', () => {
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.4')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.3-codex')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-4o-audio-preview')
    expect(OPENAI_IMAGE_MODELS).toContain('gpt-image-1.5')
    expect(OPENAI_TTS_MODELS).toContain('gpt-4o-mini-tts')
    expect(OPENAI_REALTIME_MODELS).toContain('gpt-realtime-1.5')
    expect(OPENAI_CURRENT_CHAT_MODELS).toContain('gpt-5.4')
    expect(OPENAI_DEPRECATED_CHAT_MODELS).toContain('gpt-4.5-preview')
    expect(OPENAI_PREVIEW_CHAT_MODELS).toContain('gpt-4o-search-preview')
    expect(OPENAI_CURRENT_IMAGE_MODELS).toContain('gpt-image-1.5')
    expect(OPENAI_CURRENT_TTS_MODELS).toContain('gpt-4o-mini-tts')
    expect(OPENAI_CURRENT_TRANSCRIPTION_MODELS).toContain(
      'gpt-4o-transcribe',
    )
    expect(OPENAI_CURRENT_VIDEO_MODELS).toContain('sora-2')
  })
})
