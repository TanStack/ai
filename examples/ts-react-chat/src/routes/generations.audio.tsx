import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useGenerateAudio } from '@tanstack/ai-react'
import type { UseGenerateAudioReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import type { AudioGenerationResult } from '@tanstack/ai'
import { generateAudioFn } from '../lib/server-fns'
import {
  AUDIO_PROVIDERS,
  type AudioProviderConfig,
  type AudioProviderId,
} from '../lib/audio-providers'

type Mode = 'hooks' | 'server-fn'

interface AudioOutput {
  url: string
  contentType?: string
  duration?: number
  model: string
}

/**
 * Map an AudioGenerationResult to the UI-friendly shape. Returns `null`
 * when the result has neither `url` nor `b64Json` — per the `onResult`
 * contract, a `null` return tells the hook to keep the previous result
 * and the real failure is surfaced via `onError` / the hook's error state.
 */
function toAudioOutput(raw: AudioGenerationResult): AudioOutput | null {
  const { audio } = raw
  if (audio.url) {
    return {
      url: audio.url,
      contentType: audio.contentType,
      duration: audio.duration,
      model: raw.model,
    }
  }
  if (audio.b64Json) {
    const binary = atob(audio.b64Json)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], {
      type: audio.contentType ?? 'audio/mpeg',
    })
    return {
      url: URL.createObjectURL(blob),
      contentType: audio.contentType,
      duration: audio.duration,
      model: raw.model,
    }
  }
  // Don't throw — that bypasses the hook's error plumbing. Return null so
  // the hook keeps the previous result unchanged; callers can rely on the
  // `error` state (populated via `onError`) if they want to surface this.
  return null
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

  const hookOptions = useMemo(() => {
    if (mode === 'hooks') {
      return {
        connection: fetchServerSentEvents('/api/generate/audio'),
        body: { provider: config.id, model: selectedModel },
        onResult: toAudioOutput,
      }
    }
    return {
      fetcher: (input: { prompt: string; duration?: number }) =>
        generateAudioFn({
          data: { ...input, provider: config.id, model: selectedModel },
        }),
      onResult: toAudioOutput,
    }
  }, [mode, config.id, selectedModel])

  const hookReturn = useGenerateAudio(hookOptions)

  return (
    <AudioGenerationUI
      {...hookReturn}
      config={config}
      prompt={prompt}
      setPrompt={setPrompt}
      duration={duration}
      setDuration={setDuration}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
    />
  )
}

function AudioGenerationUI({
  config,
  prompt,
  setPrompt,
  duration,
  setDuration,
  selectedModel,
  setSelectedModel,
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseGenerateAudioReturn<AudioOutput> & {
  config: AudioProviderConfig
  prompt: string
  setPrompt: (v: string) => void
  duration: number | undefined
  setDuration: (v: number | undefined) => void
  selectedModel: string
  setSelectedModel: (v: string) => void
}) {
  const handleGenerate = () => {
    if (!prompt.trim()) return
    generate({ prompt: prompt.trim(), duration })
  }

  // Track the last object URL we created so we can revoke it when the
  // result changes, reset is invoked, or the component unmounts.
  const lastBlobUrlRef = useRef<string | null>(null)
  useEffect(() => {
    const current = result?.url
    // Only track blob: URLs — remote URLs returned directly by providers
    // are not ours to revoke.
    if (current && current.startsWith('blob:')) {
      if (lastBlobUrlRef.current && lastBlobUrlRef.current !== current) {
        URL.revokeObjectURL(lastBlobUrlRef.current)
      }
      lastBlobUrlRef.current = current
    } else if (!current && lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current)
      lastBlobUrlRef.current = null
    }
  }, [result?.url])
  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current)
        lastBlobUrlRef.current = null
      }
    }
  }, [])

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
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          data-testid="audio-generate-button"
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Audio'}
        </button>
        {result && (
          <button
            onClick={reset}
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
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
          <p className="text-sm text-gray-400">
            Model: <span className="text-gray-200">{result.model}</span>
            {result.contentType != null && ` | Type: ${result.contentType}`}
            {result.duration != null && ` | Duration: ${result.duration}s`}
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
  const [mode, setMode] = useState<Mode>('hooks')
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
            {(['hooks', 'server-fn'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'server-fn' ? 'Server Fn' : 'Hooks'}
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
