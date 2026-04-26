import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useGenerateSpeech } from '@tanstack/ai-react'
import type { UseGenerateSpeechReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { generateSpeechFn, generateSpeechStreamFn } from '../lib/server-fns'
import {
  SPEECH_PROVIDERS,
  type SpeechProviderConfig,
  type SpeechProviderId,
} from '../lib/audio-providers'

type SpeechOutput = { audioUrl: string; format?: string; duration?: number }

type Mode = 'streaming' | 'direct' | 'server-fn'

function toSpeechOutput(raw: {
  audio: string
  contentType?: string
  format?: string
  duration?: number
}): SpeechOutput {
  const audioData = atob(raw.audio)
  const bytes = new Uint8Array(audioData.length)
  for (let i = 0; i < audioData.length; i++) {
    bytes[i] = audioData.charCodeAt(i)
  }
  const blob = new Blob([bytes], {
    type: raw.contentType ?? 'audio/mpeg',
  })
  return {
    audioUrl: URL.createObjectURL(blob),
    format: raw.format,
    duration: raw.duration,
  }
}

function SpeechGenerationForm({
  mode,
  config,
}: {
  mode: Mode
  config: SpeechProviderConfig
}) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(config.voices[0]?.id ?? '')

  const hookOptions = useMemo(() => {
    if (mode === 'streaming') {
      return {
        connection: fetchServerSentEvents('/api/generate/speech'),
        body: { provider: config.id },
        onResult: toSpeechOutput,
      }
    }
    if (mode === 'direct') {
      return {
        fetcher: (input: { text: string; voice?: string }) =>
          generateSpeechFn({
            data: { ...input, provider: config.id },
          }),
        onResult: toSpeechOutput,
      }
    }
    return {
      fetcher: (input: { text: string; voice?: string }) =>
        generateSpeechStreamFn({
          data: { ...input, provider: config.id },
        }),
      onResult: toSpeechOutput,
    }
  }, [mode, config.id])

  const hookReturn = useGenerateSpeech(hookOptions)

  return (
    <SpeechGenerationUI
      {...hookReturn}
      config={config}
      text={text}
      setText={setText}
      voice={voice}
      setVoice={setVoice}
    />
  )
}

function SpeechGenerationUI({
  config,
  text,
  setText,
  voice,
  setVoice,
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseGenerateSpeechReturn<SpeechOutput> & {
  config: SpeechProviderConfig
  text: string
  setText: (v: string) => void
  voice: string
  setVoice: (v: string) => void
}) {
  const handleGenerate = () => {
    if (!text.trim()) return
    generate({ text: text.trim(), voice })
  }

  // Track the last object URL we created so we can revoke it when the
  // result changes, reset is invoked, or the component unmounts.
  const lastBlobUrlRef = useRef<string | null>(null)
  useEffect(() => {
    const current = result?.audioUrl
    if (current && current.startsWith('blob:')) {
      if (lastBlobUrlRef.current && lastBlobUrlRef.current !== current) {
        URL.revokeObjectURL(lastBlobUrlRef.current)
      }
      lastBlobUrlRef.current = current
    } else if (!current && lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current)
      lastBlobUrlRef.current = null
    }
  }, [result?.audioUrl])
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
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Text</label>
        <textarea
          data-testid="speech-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={config.placeholder}
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={4}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Voice</label>
        <div className="flex flex-wrap gap-2">
          {config.voices.map((v) => (
            <button
              key={v.id}
              onClick={() => setVoice(v.id)}
              data-testid={`voice-${v.id}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voice === v.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={!text.trim() || isLoading}
          data-testid="speech-generate-button"
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Speech'}
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
          data-testid="speech-error"
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
          <p className="text-sm text-gray-400">
            Model: <span className="text-gray-200">{config.model}</span>
            {result.format != null && ` | Format: ${result.format}`}
            {result.duration != null && ` | Duration: ${result.duration}s`}
          </p>
          <audio
            data-testid="speech-audio"
            src={result.audioUrl}
            controls
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}

function SpeechGenerationPage() {
  const [mode, setMode] = useState<Mode>('streaming')
  const [provider, setProvider] = useState<SpeechProviderId>('openai')

  const config = SPEECH_PROVIDERS.find((p) => p.id === provider)!

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Text-to-Speech</h2>
            <p className="text-sm text-gray-400 mt-1">
              Convert text to spoken audio. Try each provider to compare voices
              and quality.
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            {(['streaming', 'direct', 'server-fn'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'server-fn'
                  ? 'Server Fn'
                  : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-orange-500/20 bg-gray-800/60 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {SPEECH_PROVIDERS.map((p) => (
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
          <SpeechGenerationForm
            key={`${mode}-${config.id}`}
            mode={mode}
            config={config}
          />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/speech')({
  component: SpeechGenerationPage,
})
