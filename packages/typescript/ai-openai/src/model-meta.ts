import { IMAGE_MODELS } from './models/image'
import { REALTIME_MODELS, TRANSCRIPTION_MODELS, TTS_MODELS } from './models/audio'
import { TEXT_MODELS } from './models/text'
import { VIDEO_MODELS } from './models/video'
import {
  idsByStatus,
  snapshotIds,
  supportedIds,
} from './models/shared'
import type { TextProviderOptionsForEntry } from './models/text'
import type {
  RegistryEntryByModel,
  RegistryInputByName,
  RegistryModelId,
  RegistryPropertyByName,
  RegistrySizeByName,
} from './models/shared'

export const OPENAI_CHAT_MODELS = supportedIds(TEXT_MODELS)
export const OPENAI_CURRENT_CHAT_MODELS = idsByStatus(TEXT_MODELS, 'active')
export const OPENAI_DEPRECATED_CHAT_MODELS = idsByStatus(TEXT_MODELS, 'deprecated')
export const OPENAI_PREVIEW_CHAT_MODELS = idsByStatus(TEXT_MODELS, 'preview')
export const OPENAI_CHAT_SNAPSHOT_MODELS = snapshotIds(TEXT_MODELS)

export type OpenAIChatModel = RegistryModelId<typeof TEXT_MODELS>

export type OpenAIChatModelProviderOptionsByName = {
  [TModel in OpenAIChatModel]: TextProviderOptionsForEntry<
    RegistryEntryByModel<typeof TEXT_MODELS, TModel>
  >
}

export type OpenAIModelInputModalitiesByName = RegistryInputByName<
  typeof TEXT_MODELS
>

export const OPENAI_IMAGE_MODELS = supportedIds(IMAGE_MODELS)
export const OPENAI_CURRENT_IMAGE_MODELS = idsByStatus(IMAGE_MODELS, 'active')
export const OPENAI_IMAGE_SNAPSHOT_MODELS = snapshotIds(IMAGE_MODELS)

export type OpenAIImageModel = RegistryModelId<typeof IMAGE_MODELS>
export type OpenAIImageModelProviderOptionsByName = RegistryPropertyByName<
  typeof IMAGE_MODELS,
  'providerOptions'
>
export type OpenAIImageModelSizeByName = RegistrySizeByName<typeof IMAGE_MODELS>

export const OPENAI_VIDEO_MODELS = supportedIds(VIDEO_MODELS)
export const OPENAI_CURRENT_VIDEO_MODELS = idsByStatus(VIDEO_MODELS, 'active')

export type OpenAIVideoModel = RegistryModelId<typeof VIDEO_MODELS>
export type OpenAIVideoModelProviderOptionsByName = RegistryPropertyByName<
  typeof VIDEO_MODELS,
  'providerOptions'
>
export type OpenAIVideoModelSizeByName = RegistrySizeByName<typeof VIDEO_MODELS>

export const OPENAI_TTS_MODELS = supportedIds(TTS_MODELS)
export const OPENAI_CURRENT_TTS_MODELS = idsByStatus(TTS_MODELS, 'active')
export const OPENAI_TTS_SNAPSHOT_MODELS = snapshotIds(TTS_MODELS)
export type OpenAITTSModel = RegistryModelId<typeof TTS_MODELS>

export const OPENAI_TRANSCRIPTION_MODELS = supportedIds(TRANSCRIPTION_MODELS)
export const OPENAI_CURRENT_TRANSCRIPTION_MODELS = idsByStatus(
  TRANSCRIPTION_MODELS,
  'active',
)
export const OPENAI_TRANSCRIPTION_SNAPSHOT_MODELS =
  snapshotIds(TRANSCRIPTION_MODELS)
export type OpenAITranscriptionModel = RegistryModelId<
  typeof TRANSCRIPTION_MODELS
>

export const OPENAI_REALTIME_MODELS = supportedIds(REALTIME_MODELS)
export const OPENAI_REALTIME_SNAPSHOT_MODELS = snapshotIds(REALTIME_MODELS)
export type OpenAIRealtimeModel = RegistryModelId<typeof REALTIME_MODELS>
