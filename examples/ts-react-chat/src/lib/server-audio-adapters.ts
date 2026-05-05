/**
 * Server-side adapter factories for the audio example pages.
 *
 * Keeping these in one place lets the HTTP routes and the TanStack Start server
 * functions share the same model choices without duplicating provider wiring.
 */

import { openaiSpeech, openaiTranscription } from '@tanstack/ai-openai'
import { geminiAudio, geminiSpeech } from '@tanstack/ai-gemini'
import { falAudio, falSpeech, falTranscription } from '@tanstack/ai-fal'
import { grokSpeech, grokTranscription } from '@tanstack/ai-grok'
import type {
  AnyAudioAdapter,
  AnyTranscriptionAdapter,
  AnyTTSAdapter,
} from '@tanstack/ai'
import {
  AUDIO_PROVIDERS,
  SPEECH_PROVIDERS,
  TRANSCRIPTION_PROVIDERS,
  type AudioProviderId,
  type SpeechProviderId,
  type TranscriptionProviderId,
} from './audio-providers'

function findConfig<T extends { id: string }>(
  list: ReadonlyArray<T>,
  id: string,
): T {
  const match = list.find((entry) => entry.id === id)
  if (!match) {
    throw new UnknownProviderError(
      id,
      list.map((entry) => entry.id),
    )
  }
  return match
}

export function buildSpeechAdapter(provider: SpeechProviderId): AnyTTSAdapter {
  const config = findConfig(SPEECH_PROVIDERS, provider)
  switch (config.id) {
    case 'openai':
      return openaiSpeech(config.model as 'tts-1')
    case 'gemini':
      return geminiSpeech(config.model as 'gemini-2.5-flash-preview-tts')
    case 'fal':
      return falSpeech(config.model)
    case 'grok':
      return grokSpeech(config.model as 'grok-tts')
  }
}

export function buildTranscriptionAdapter(
  provider: TranscriptionProviderId,
): AnyTranscriptionAdapter {
  const config = findConfig(TRANSCRIPTION_PROVIDERS, provider)
  switch (config.id) {
    case 'openai':
      return openaiTranscription(config.model as 'whisper-1')
    case 'fal':
      return falTranscription(config.model)
    case 'grok':
      return grokTranscription(config.model as 'grok-stt')
  }
}

export function buildAudioAdapter(
  provider: AudioProviderId,
  modelOverride?: string,
): AnyAudioAdapter {
  const config = findConfig(AUDIO_PROVIDERS, provider)
  const model = resolveModel(config, modelOverride)
  switch (config.id) {
    case 'gemini-lyria':
      return geminiAudio(
        model as 'lyria-3-clip-preview' | 'lyria-3-pro-preview',
      )
    case 'fal-audio':
    case 'fal-sfx':
      return falAudio(model)
  }
}

/**
 * Thrown when a caller supplies a `modelOverride` that is not present in the
 * provider's allowed model list. HTTP routes map this to a 400 response so the
 * user sees a clear rejection instead of silently getting output from the
 * default model.
 */
export class InvalidModelOverrideError extends Error {
  readonly code = 'invalid_model_override' as const
  readonly providerId: string
  readonly requestedModel: string
  readonly allowedModels: ReadonlyArray<string>

  constructor(
    providerId: string,
    requestedModel: string,
    allowedModels: ReadonlyArray<string>,
  ) {
    super(
      `Invalid model override "${requestedModel}" for provider "${providerId}". Allowed models: ${
        allowedModels.length > 0 ? allowedModels.join(', ') : '(none)'
      }`,
    )
    this.name = 'InvalidModelOverrideError'
    this.providerId = providerId
    this.requestedModel = requestedModel
    this.allowedModels = allowedModels
  }
}

/**
 * Thrown when `findConfig` is called with a provider id that isn't in the
 * allowed list. In practice the route-level Zod enum schema already rejects
 * unknown providers before we ever reach this builder, so this is
 * defense-in-depth for callers that bypass Zod validation (e.g. server-fns
 * whose input schemas could drift from the provider registries).
 */
export class UnknownProviderError extends Error {
  readonly code = 'unknown_provider' as const
  readonly providerId: string
  readonly allowedProviders: ReadonlyArray<string>

  constructor(providerId: string, allowedProviders: ReadonlyArray<string>) {
    super(
      `Unknown provider "${providerId}". Allowed providers: ${
        allowedProviders.length > 0 ? allowedProviders.join(', ') : '(none)'
      }`,
    )
    this.name = 'UnknownProviderError'
    this.providerId = providerId
    this.allowedProviders = allowedProviders
  }
}

function resolveModel(
  config: (typeof AUDIO_PROVIDERS)[number],
  modelOverride: string | undefined,
): string {
  if (!modelOverride) return config.model
  const allowedModels = config.models?.map((m) => m.id) ?? []
  if (allowedModels.includes(modelOverride)) return modelOverride
  throw new InvalidModelOverrideError(config.id, modelOverride, allowedModels)
}
