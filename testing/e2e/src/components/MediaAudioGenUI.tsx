import { useState } from 'react'
import type {
  MusicGenerationResult,
  SoundEffectsGenerationResult,
} from '@tanstack/ai'
import { generateMusicFn, generateSoundEffectsFn } from '@/lib/server-functions'
import type { Mode, Provider } from '@/lib/types'

export type MediaAudioKind = 'music' | 'sound-effects'

type GenerationResult = MusicGenerationResult | SoundEffectsGenerationResult

interface MediaAudioGenUIProps {
  provider: Provider
  mode: Mode
  kind: MediaAudioKind
  testId?: string
  aimockPort?: number
}

async function fetchAudioViaRoute(
  kind: MediaAudioKind,
  payload: {
    prompt: string
    provider: Provider
    testId?: string
    aimockPort?: number
  },
): Promise<GenerationResult> {
  const endpoint = kind === 'music' ? '/api/music' : '/api/sound-effects'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`)
  }
  return body.result as GenerationResult
}

export function MediaAudioGenUI({
  provider,
  mode,
  kind,
  testId,
  aimockPort,
}: MediaAudioGenUIProps) {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)

  const generate = async () => {
    if (!prompt.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const payload = { prompt, provider, testId, aimockPort }
      let next: GenerationResult
      if (mode === 'fetcher') {
        next =
          kind === 'music'
            ? await generateMusicFn({ data: payload })
            : await generateSoundEffectsFn({ data: payload })
      } else {
        next = await fetchAudioViaRoute(kind, payload)
      }
      setResult(next)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setIsLoading(false)
    }
  }

  const audioSrc = result
    ? (result.audio.url ??
      (result.audio.b64Json
        ? `data:${result.audio.contentType ?? 'audio/mpeg'};base64,${result.audio.b64Json}`
        : undefined))
    : undefined

  const statusText = isLoading
    ? 'loading'
    : error
      ? 'error'
      : result
        ? 'complete'
        : 'idle'

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input
          data-testid="prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            kind === 'music' ? 'Describe the music...' : 'Describe the sound...'
          }
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          data-testid="generate-button"
          onClick={generate}
          disabled={!prompt.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Generate
        </button>
      </div>
      <div data-testid="generation-status">{statusText}</div>
      {error && (
        <div data-testid="generation-error" className="text-red-400 text-sm">
          {error.message}
        </div>
      )}
      {audioSrc && (
        <audio
          data-testid="generated-audio"
          src={audioSrc}
          controls
          className="w-full"
        />
      )}
    </div>
  )
}
