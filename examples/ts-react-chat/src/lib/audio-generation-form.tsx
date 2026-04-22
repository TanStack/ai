import { useMemo, useState } from 'react'
import type {
  MusicGenerationResult,
  SoundEffectsGenerationResult,
} from '@tanstack/ai'
import type { AudioGenerationProviderConfig } from './audio-providers'

type AudioGenerationResult =
  | MusicGenerationResult
  | SoundEffectsGenerationResult

export type AudioGenerationMode = 'direct' | 'server-fn'

export interface AudioGenerationFormProps<TId extends string> {
  mode: AudioGenerationMode
  config: AudioGenerationProviderConfig<TId>
  /** Called when the user clicks "Generate" via the server function path. */
  generateViaServerFn: (input: {
    prompt: string
    duration?: number
    provider: TId
    model?: string
  }) => Promise<AudioGenerationResult>
  /** Called when the user clicks "Generate" via the direct HTTP route path. */
  generateViaRoute: (input: {
    prompt: string
    duration?: number
    provider: TId
    model?: string
  }) => Promise<AudioGenerationResult>
  /** Distinguishes the flows visually and in data-testids. */
  kind: 'music' | 'sound-effects'
}

interface AudioResultState {
  url: string
  contentType?: string
  duration?: number
  model: string
}

function toAudioUrl(audio: AudioGenerationResult['audio']): string {
  if (audio.url) return audio.url
  if (audio.b64Json) {
    const binary = atob(audio.b64Json)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], {
      type: audio.contentType ?? 'audio/mpeg',
    })
    return URL.createObjectURL(blob)
  }
  throw new Error('Audio response had neither url nor b64Json data')
}

export function AudioGenerationForm<TId extends string>({
  mode,
  config,
  generateViaServerFn,
  generateViaRoute,
  kind,
}: AudioGenerationFormProps<TId>) {
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState<number | undefined>(
    config.defaultDuration,
  )
  const [selectedModel, setSelectedModel] = useState<string>(config.model)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AudioResultState | null>(null)

  const generate = useMemo(
    () => async () => {
      if (!prompt.trim()) return
      setIsLoading(true)
      setError(null)
      try {
        const payload = {
          prompt: prompt.trim(),
          duration,
          provider: config.id,
          model: selectedModel,
        }
        const response =
          mode === 'server-fn'
            ? await generateViaServerFn(payload)
            : await generateViaRoute(payload)
        setResult({
          url: toAudioUrl(response.audio),
          contentType: response.audio.contentType,
          duration: response.audio.duration,
          model: response.model,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsLoading(false)
      }
    },
    [
      prompt,
      duration,
      config.id,
      mode,
      selectedModel,
      generateViaServerFn,
      generateViaRoute,
    ],
  )

  const testIdPrefix = kind === 'music' ? 'music' : 'sfx'

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {config.models && config.models.length > 1 ? (
          <div className="flex items-center gap-3">
            <label
              htmlFor={`${testIdPrefix}-model-select`}
              className="text-xs text-gray-400"
            >
              Model:
            </label>
            <select
              id={`${testIdPrefix}-model-select`}
              data-testid={`${testIdPrefix}-model-select`}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isLoading}
              className="flex-1 rounded-md border border-orange-500/20 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {config.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.id}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            Model: <span className="text-gray-200">{config.model}</span>
          </p>
        )}
        <p className="text-xs text-gray-500">{config.description}</p>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Prompt</label>
        <textarea
          data-testid={`${testIdPrefix}-prompt-input`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={config.placeholder}
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={4}
          disabled={isLoading}
        />
        {config.samplePrompts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 self-center">Try:</span>
            {config.samplePrompts.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setPrompt(sample.prompt)}
                disabled={isLoading}
                data-testid={`${testIdPrefix}-sample-${sample.label
                  .toLowerCase()
                  .replace(/\s+/g, '-')}`}
                className="px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-xs text-orange-200 hover:bg-orange-500/20 hover:border-orange-500/50 disabled:opacity-50 transition-colors"
              >
                {sample.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {config.defaultDuration != null && (
        <div className="space-y-3">
          <label className="text-sm text-gray-400">
            Duration ({duration ?? 0}s)
          </label>
          <input
            data-testid={`${testIdPrefix}-duration-input`}
            type="range"
            min={1}
            max={60}
            value={duration ?? config.defaultDuration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={isLoading}
            className="w-full accent-orange-500"
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={generate}
          disabled={!prompt.trim() || isLoading}
          data-testid={`${testIdPrefix}-generate-button`}
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading
            ? 'Generating...'
            : kind === 'music'
              ? 'Generate Music'
              : 'Generate Sound Effect'}
        </button>
        {result && (
          <button
            onClick={() => {
              setResult(null)
              setError(null)
            }}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div
          data-testid={`${testIdPrefix}-error`}
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
          <p className="text-sm text-gray-400">
            Model: <span className="text-gray-200">{result.model}</span>
            {result.contentType && ` | Type: ${result.contentType}`}
            {result.duration && ` | Duration: ${result.duration}s`}
          </p>
          <audio
            data-testid={`${testIdPrefix}-player`}
            src={result.url}
            controls
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
