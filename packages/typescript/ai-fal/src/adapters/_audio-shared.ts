/**
 * Shared request/response helpers for fal audio-like activities
 * (music and sound-effects). These two activities hit the same
 * `fal.subscribe(model, { input })` endpoint and return the same
 * `{ audio: {...} }` payload shape, so we lift the plumbing here
 * and let each adapter wire it into its own discriminator.
 */

import { fal } from '@fal-ai/client'
import type { OutputType, Result } from '@fal-ai/client'
import type { GeneratedAudio } from '@tanstack/ai'
import type { FalModelInput } from '../model-meta'

export interface FalAudioLikeOptions<TProviderOptions extends object> {
  prompt: string
  duration?: number
  modelOptions?: TProviderOptions
}

export function buildFalAudioInput<
  TModel extends string,
  TProviderOptions extends object,
>(
  options: FalAudioLikeOptions<TProviderOptions>,
  _model: TModel,
): FalModelInput<TModel> {
  return {
    ...options.modelOptions,
    prompt: options.prompt,
    ...(options.duration != null ? { duration: options.duration } : {}),
  } as FalModelInput<TModel>
}

export async function runFalAudio<TModel extends string>(
  model: TModel,
  input: FalModelInput<TModel>,
): Promise<Result<OutputType<TModel>>> {
  return fal.subscribe(model, { input })
}

export function transformFalAudioResponse<TModel extends string>(
  response: Result<OutputType<TModel>>,
  model: TModel,
  generateId: () => string,
): { id: string; model: TModel; audio: GeneratedAudio } {
  const data = response.data as Record<string, unknown>

  // fal returns { audio: { url, content_type } } or { audio_url: string }
  let audioUrl: string | undefined
  let contentType: string | undefined

  if (data.audio && typeof data.audio === 'object' && 'url' in data.audio) {
    const audioObj = data.audio as { url: string; content_type?: string }
    audioUrl = audioObj.url
    contentType = audioObj.content_type
  } else if (typeof data.audio_url === 'string') {
    audioUrl = data.audio_url
  }

  if (!audioUrl) {
    throw new Error('Audio URL not found in fal audio generation response')
  }

  return {
    id: response.requestId || generateId(),
    model,
    audio: {
      url: audioUrl,
      contentType,
    },
  }
}
