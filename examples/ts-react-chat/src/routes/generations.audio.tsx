import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { AudioGenerationResult } from '@tanstack/ai'
import { generateAudioFn } from '../lib/server-fns'
import {
  AUDIO_PROVIDERS,
  type AudioProviderConfig,
  type AudioProviderId,
} from '../lib/audio-providers'

type Mode = 'direct' | 'server-fn'

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

async function generateViaRoute(input: {
  prompt: string
  duration?: number
  provider: AudioProviderId
  model?: string
}): Promise<AudioGenerationResult> {
  const response = await fetch('/api/generate/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: input }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'Audio generation failed')
  }
  return payload.result as AudioGenerationResult
}

function AudioGenerationForm({
  mode,
  config,
}: {
  mode: Mode
  config: AudioProviderConfig
}) {
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
            ? await generateAudioFn({ data: payload })
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
    [prompt, duration, config.id, mode, selectedModel],
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {config.models && config.models.length > 1 ? (
          <div className="flex items-center gap-3">
            <label
              htmlFor="audio-model-select"
              className="text-xs text-gray-400"
            >
              Model:
            </label>
            <select
              id="audio-model-select"
              data-testid="audio-model-select"
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
          data-testid="audio-prompt-input"
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
                data-testid={`audio-sample-${sample.label
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
            data-testid="audio-duration-input"
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
          data-testid="audio-generate-button"
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Audio'}
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
          data-testid="audio-error"
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
            data-testid="audio-player"
            src={result.url}
            controls
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}

function AudioGenerationPage() {
  const [mode, setMode] = useState<Mode>('direct')
  const [provider, setProvider] = useState<AudioProviderId>('gemini-lyria')

  const config = AUDIO_PROVIDERS.find((p) => p.id === provider)!

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Audio Generation</h2>
            <p className="text-sm text-gray-400 mt-1">
              Generate music and sound effects from text prompts.
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            {(['direct', 'server-fn'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'server-fn' ? 'Server Fn' : 'Direct'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-orange-500/20 bg-gray-800/60 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {AUDIO_PROVIDERS.map((p) => (
            <button
              key={p.id}
              data-testid={`provider-tab-${p.id}`}
              onClick={() => setProvider(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                provider === p.id
                  ? 'bg-orange-500/80 text-white'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <AudioGenerationForm
            key={`${mode}-${config.id}`}
            mode={mode}
            config={config}
          />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/audio')({
  component: AudioGenerationPage,
})
