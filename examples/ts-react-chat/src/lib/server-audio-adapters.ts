/**
 * Server-side adapter factories for the audio example pages.
 *
 * Keeping these in one place lets the HTTP routes and the TanStack Start server
 * functions share the same model choices without duplicating provider wiring.
 */

import { openaiSpeech, openaiTranscription } from '@tanstack/ai-openai'
import { geminiAudio, geminiSpeech } from '@tanstack/ai-gemini'
import { falAudio, falSpeech, falTranscription } from '@tanstack/ai-fal'
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

function resolveModel(
  config: (typeof AUDIO_PROVIDERS)[number],
  modelOverride: string | undefined,
): string {
  if (!modelOverride) return config.model
  const allowed = config.models?.some((m) => m.id === modelOverride)
  if (allowed) return modelOverride
  console.warn(
    `[audio] rejected model override "${modelOverride}" for provider "${config.id}"; falling back to "${config.model}"`,
  )
  return config.model
}
