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
} from '../src/model-meta'
import type {
  OpenAIReasoningOptions,
  OpenAIReasoningOptionsWithConcise,
  OpenAIStreamingOptions,
  OpenAIStructuredOutputOptions,
  OpenAIToolsOptions,
} from '../src/text/text-provider-options'
import { validateTextProviderOptions } from '../src/text/text-provider-options'

describe('OpenAI registries', () => {
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
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.4-2026-03-05')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-audio-2025-08-28')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-4o-audio-preview-2025-06-03')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-4o-search-preview-2025-03-11')
    expect(OPENAI_CHAT_MODELS).toContain(
      'gpt-4o-mini-search-preview-2025-03-11',
    )
    expect(OPENAI_CHAT_MODELS).toContain('computer-use-preview-2025-03-11')
    expect(OPENAI_TTS_MODELS).toContain('gpt-4o-mini-tts-2025-12-15')
    expect(OPENAI_TTS_MODELS).toContain('gpt-4o-mini-tts-2025-03-20')
    expect(OPENAI_TRANSCRIPTION_MODELS).toContain(
      'gpt-4o-mini-transcribe-2025-12-15',
    )
    expect(OPENAI_TRANSCRIPTION_MODELS).toContain(
      'gpt-4o-mini-transcribe-2025-03-20',
    )
    expect(OPENAI_IMAGE_MODELS).toContain('gpt-image-1.5-2025-12-16')
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
    type GPT53ChatOptions =
      OpenAIChatModelProviderOptionsByName['gpt-5.3-chat-latest']
    type GPT5ProOptions = OpenAIChatModelProviderOptionsByName['gpt-5-pro']
    type GPT41Options = OpenAIChatModelProviderOptionsByName['gpt-4.1']
    type GPT4TurboOptions = OpenAIChatModelProviderOptionsByName['gpt-4-turbo']
    type GPT35TurboOptions =
      OpenAIChatModelProviderOptionsByName['gpt-3.5-turbo']
    type SearchPreviewOptions =
      OpenAIChatModelProviderOptionsByName['gpt-4o-search-preview']
    type O1MiniOptions = OpenAIChatModelProviderOptionsByName['o1-mini']
    type O3ProOptions = OpenAIChatModelProviderOptionsByName['o3-pro']
    type ComputerUseOptions =
      OpenAIChatModelProviderOptionsByName['computer-use-preview']

    expectTypeOf<GPT54Options>().toExtend<OpenAIReasoningOptions>()
    expectTypeOf<GPT54Options>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT54Options>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT53ChatOptions>().not.toExtend<OpenAIReasoningOptions>()
    expectTypeOf<GPT53ChatOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT53ChatOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<GPT5ProOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<GPT41Options>().not.toExtend<OpenAIReasoningOptions>()
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
    expectTypeOf<O1MiniOptions>().toExtend<OpenAIReasoningOptions>()
    expectTypeOf<O1MiniOptions>().not.toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<O1MiniOptions>().not.toExtend<OpenAIToolsOptions>()
    expectTypeOf<O3ProOptions>().toExtend<OpenAIReasoningOptions>()
    expectTypeOf<O3ProOptions>().toExtend<OpenAIStructuredOutputOptions>()
    expectTypeOf<O3ProOptions>().toExtend<OpenAIToolsOptions>()
    expectTypeOf<O3ProOptions>().not.toExtend<OpenAIStreamingOptions>()
    expectTypeOf<ComputerUseOptions>().toExtend<
      OpenAIReasoningOptionsWithConcise
    >()
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

    expectTypeOf<OpenAIChatModel>().toEqualTypeOf<TextIds>()
    expectTypeOf<keyof OpenAIChatModelProviderOptionsByName>().toEqualTypeOf<TextIds>()
    expectTypeOf<keyof OpenAIModelInputModalitiesByName>().toEqualTypeOf<TextIds>()
    expectTypeOf<keyof OpenAIImageModelProviderOptionsByName>().toEqualTypeOf<
      ImageIds
    >()
    expectTypeOf<keyof OpenAIImageModelSizeByName>().toEqualTypeOf<ImageIds>()
  })

  it('keeps modality spot checks on the registry-backed maps', () => {
    type GPT54Modalities = OpenAIModelInputModalitiesByName['gpt-5.4']
    type Audio15Modalities = OpenAIModelInputModalitiesByName['gpt-audio-1.5']
    type ImageSizes = OpenAIImageModelSizeByName['gpt-image-1.5']
    type O1PreviewModalities = OpenAIModelInputModalitiesByName['o1-preview']
    type O1MiniModalities = OpenAIModelInputModalitiesByName['o1-mini']
    type O3MiniModalities = OpenAIModelInputModalitiesByName['o3-mini']

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
  })

  it('widens the realtime union with supported snapshot-style ids', () => {
    type RealtimeIds = RegistryModelId<typeof REALTIME_MODELS>

    expectTypeOf<OpenAIRealtimeModel>().toEqualTypeOf<RealtimeIds>()
    expectTypeOf<'gpt-realtime-1.5'>().toExtend<OpenAIRealtimeModel>()
    expect(OPENAI_REALTIME_MODELS).not.toContain('gpt-4o-realtime')
    expect(OPENAI_REALTIME_SNAPSHOT_MODELS).toContain(
      'gpt-realtime-mini-2025-10-06',
    )
    expect(OPENAI_REALTIME_SNAPSHOT_MODELS).toContain(
      'gpt-4o-realtime-preview-2025-06-03',
    )
    expect(OPENAI_REALTIME_SNAPSHOT_MODELS).toContain(
      'gpt-4o-realtime-preview-2024-10-01',
    )
  })

  it('keeps newer official ids on the expected surfaces', () => {
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.4')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.4-mini')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.4-nano')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-5.3-codex')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-4o-audio-preview')
    expect(OPENAI_CHAT_MODELS).toContain('gpt-oss-120b')
    expect(OPENAI_IMAGE_MODELS).toContain('gpt-image-1.5')
    expect(OPENAI_TTS_MODELS).toContain('gpt-4o-mini-tts')
    expect(OPENAI_REALTIME_MODELS).toContain('gpt-realtime-1.5')
  })

  it('rejects unsupported reasoning values at runtime', () => {
    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5',
        reasoning: { effort: 'none' },
      }),
    ).toThrow('does not support reasoning.effort "none"')

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5.4',
        reasoning: { summary: 'concise' },
      }),
    ).toThrow('does not support reasoning.summary "concise"')

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-4o',
        reasoning: { effort: 'low' },
      }),
    ).toThrow('does not support reasoning options')
  })

  it('accepts supported reasoning values at runtime', () => {
    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5.1',
        reasoning: { effort: 'none', summary: 'auto' },
      }),
    ).not.toThrow()

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5.4-pro',
        reasoning: { effort: 'xhigh' },
      }),
    ).not.toThrow()

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'computer-use-preview',
        reasoning: { summary: 'concise' },
      }),
    ).not.toThrow()
  })
})
