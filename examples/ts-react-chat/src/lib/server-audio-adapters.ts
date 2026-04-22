/**
 * Server-side adapter factories for the audio example pages.
 *
 * Keeping these in one place lets the HTTP routes and the TanStack Start server
 * functions share the same model choices without duplicating provider wiring.
 */

import { openaiSpeech, openaiTranscription } from '@tanstack/ai-openai'
import { geminiMusic, geminiSpeech } from '@tanstack/ai-gemini'
import {
  falMusic,
  falSoundEffects,
  falSpeech,
  falTranscription,
} from '@tanstack/ai-fal'
import type {
  AnyMusicAdapter,
  AnySoundEffectsAdapter,
  AnyTranscriptionAdapter,
  AnyTTSAdapter,
} from '@tanstack/ai'
import {
  MUSIC_PROVIDERS,
  SOUND_EFFECTS_PROVIDERS,
  SPEECH_PROVIDERS,
  TRANSCRIPTION_PROVIDERS,
  type MusicProviderId,
  type SoundEffectsProviderId,
  type SpeechProviderId,
  type TranscriptionProviderId,
} from './audio-providers'

function findConfig<T extends { id: string }>(
  list: ReadonlyArray<T>,
  id: string,
): T {
  const match = list.find((entry) => entry.id === id)
  if (!match) throw new Error(`Unknown provider: ${id}`)
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
  }
}

export function buildMusicAdapter(
  provider: MusicProviderId,
  modelOverride?: string,
): AnyMusicAdapter {
  const config = findConfig(MUSIC_PROVIDERS, provider)
  const model = resolveModel(MUSIC_PROVIDERS, config, modelOverride, 'music')
  switch (config.id) {
    case 'gemini-lyria':
      return geminiMusic(model as 'lyria-3-clip-preview')
    case 'fal-music':
      return falMusic(model)
  }
}

export function buildSoundEffectsAdapter(
  provider: SoundEffectsProviderId,
  modelOverride?: string,
): AnySoundEffectsAdapter {
  const config = findConfig(SOUND_EFFECTS_PROVIDERS, provider)
  const model = resolveModel(
    SOUND_EFFECTS_PROVIDERS,
    config,
    modelOverride,
    'sound-effects',
  )
  switch (config.id) {
    case 'fal-sound-effects':
      return falSoundEffects(model)
  }
}

function resolveModel<
  T extends {
    id: string
    model: string
    models?: ReadonlyArray<{ id: string }>
  },
>(
  _list: ReadonlyArray<T>,
  config: T,
  modelOverride: string | undefined,
  kind: 'music' | 'sound-effects',
): string {
  if (!modelOverride) return config.model
  const allowed = config.models?.some((m) => m.id === modelOverride)
  if (allowed) return modelOverride
  console.warn(
    `[${kind}] rejected model override "${modelOverride}" for provider "${config.id}"; falling back to "${config.model}"`,
  )
  return config.model
}
