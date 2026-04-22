import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranscription } from '@tanstack/ai-react'
import type { UseTranscriptionReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { transcribeFn, transcribeStreamFn } from '../lib/server-fns'
import {
  TRANSCRIPTION_PROVIDERS,
  type TranscriptionProviderConfig,
  type TranscriptionProviderId,
} from '../lib/audio-providers'

type Mode = 'streaming' | 'direct' | 'server-fn'

function TranscriptionForm({
  mode,
  config,
}: {
  mode: Mode
  config: TranscriptionProviderConfig
}) {
  const hookOptions = useMemo(() => {
    if (mode === 'streaming') {
      return {
        connection: fetchServerSentEvents('/api/transcribe'),
        body: { provider: config.id },
      }
    }
    if (mode === 'direct') {
      return {
        fetcher: (input: { audio: string | Blob; language?: string }) =>
          transcribeFn({
            data: {
              audio: input.audio as string,
              language: input.language,
              provider: config.id,
            },
          }),
      }
    }
    return {
      fetcher: (input: { audio: string | Blob; language?: string }) =>
        transcribeStreamFn({
          data: {
            audio: input.audio as string,
            language: input.language,
            provider: config.id,
          },
        }),
    }
  }, [mode, config.id])

  const hookReturn = useTranscription(hookOptions)
  return <TranscriptionUI {...hookReturn} config={config} />
}

function TranscriptionUI({
  config,
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseTranscriptionReturn & { config: TranscriptionProviderConfig }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
    )
    const dataUrl = `data:${file.type};base64,${base64}`

    await generate({ audio: dataUrl, language: 'en' })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs text-gray-400">
          Model: <span className="text-gray-200">{config.model}</span>
        </p>
        <p className="text-xs text-gray-500">{config.description}</p>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Upload Audio File</label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            data-testid="transcription-file-input"
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            disabled={isLoading}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-600 file:text-white hover:file:bg-orange-700 disabled:opacity-50"
          />
          {result && (
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Supported: mp3, mp4, wav, webm, flac, ogg (max 25 MB)
        </p>
      </div>

      {isLoading && (
        <div
          data-testid="transcription-loading"
          className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg"
        >
          <p className="text-sm text-gray-400">Transcribing...</p>
        </div>
      )}

      {error && (
        <div
          data-testid="transcription-error"
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400 mb-2">
              {result.language != null && `Language: ${result.language}`}
              {result.duration != null && ` | Duration: ${result.duration}s`}
            </p>
            <p
              data-testid="transcription-text"
              className="text-white whitespace-pre-wrap"
            >
              {result.text}
            </p>
          </div>

          {result.segments && result.segments.length > 0 && (
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
              <p className="text-sm text-gray-400 mb-3">Segments</p>
              <div className="space-y-2">
                {result.segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-gray-500 font-mono whitespace-nowrap">
                      {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                    </span>
                    <span className="text-white">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TranscriptionPage() {
  const [mode, setMode] = useState<Mode>('streaming')
  const [provider, setProvider] = useState<TranscriptionProviderId>('openai')

  const config = TRANSCRIPTION_PROVIDERS.find((p) => p.id === provider)!

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Audio Transcription</h2>
            <p className="text-sm text-gray-400 mt-1">
              Transcribe audio files to text across providers.
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
          {TRANSCRIPTION_PROVIDERS.map((p) => (
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
          <TranscriptionForm
            key={`${mode}-${config.id}`}
            mode={mode}
            config={config}
          />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/transcription')({
  component: TranscriptionPage,
})
