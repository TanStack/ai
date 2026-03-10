import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranscription } from '@tanstack/ai-react'
import type { UseTranscriptionReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { transcribeFn, transcribeStreamFn } from '../lib/server-fns'

function StreamingTranscription() {
  const hookReturn = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  return <TranscriptionUI {...hookReturn} />
}

function DirectTranscription() {
  const hookReturn = useTranscription({
    fetcher: (input) =>
      transcribeFn({
        data: { ...input, audio: input.audio as string },
      }),
  })

  return <TranscriptionUI {...hookReturn} />
}

function ServerFnTranscription() {
  const hookReturn = useTranscription({
    fetcher: (input) =>
      transcribeStreamFn({
        data: { ...input, audio: input.audio as string },
      }),
  })

  return <TranscriptionUI {...hookReturn} />
}

function TranscriptionUI({
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseTranscriptionReturn) {
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
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Upload Audio File</label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
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
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400">Transcribing...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <p className="text-sm text-gray-400 mb-2">
              {result.language && `Language: ${result.language}`}
              {result.duration && ` | Duration: ${result.duration}s`}
            </p>
            <p className="text-white whitespace-pre-wrap">{result.text}</p>
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
  const [mode, setMode] = useState<'streaming' | 'direct' | 'server-fn'>(
    'streaming',
  )

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Audio Transcription</h2>
            <p className="text-sm text-gray-400 mt-1">
              Transcribe audio files to text using OpenAI Whisper
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            <button
              onClick={() => setMode('streaming')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'streaming'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Streaming
            </button>
            <button
              onClick={() => setMode('direct')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'direct'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setMode('server-fn')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'server-fn'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Server Fn
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {mode === 'streaming' ? (
            <StreamingTranscription key="streaming" />
          ) : mode === 'direct' ? (
            <DirectTranscription key="direct" />
          ) : (
            <ServerFnTranscription key="server-fn" />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/transcription')({
  component: TranscriptionPage,
})
