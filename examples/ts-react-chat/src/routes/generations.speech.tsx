import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useGenerateSpeech } from '@tanstack/ai-react'
import type { UseGenerateSpeechReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { generateSpeechFn, generateSpeechStreamFn } from '../lib/server-fns'

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const

type SpeechOutput = { audioUrl: string; format?: string; duration?: number }

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

function StreamingSpeechGeneration() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<string>('alloy')

  const hookReturn = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
    onResult: toSpeechOutput,
  })

  return (
    <SpeechGenerationUI
      {...hookReturn}
      text={text}
      setText={setText}
      voice={voice}
      setVoice={setVoice}
    />
  )
}

function DirectSpeechGeneration() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<string>('alloy')

  const hookReturn = useGenerateSpeech({
    fetcher: (input) => generateSpeechFn({ data: input }),
    onResult: toSpeechOutput,
  })

  return (
    <SpeechGenerationUI
      {...hookReturn}
      text={text}
      setText={setText}
      voice={voice}
      setVoice={setVoice}
    />
  )
}

function ServerFnSpeechGeneration() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<string>('alloy')

  const hookReturn = useGenerateSpeech({
    fetcher: (input) => generateSpeechStreamFn({ data: input }),
    onResult: toSpeechOutput,
  })

  return (
    <SpeechGenerationUI
      {...hookReturn}
      text={text}
      setText={setText}
      voice={voice}
      setVoice={setVoice}
    />
  )
}

function SpeechGenerationUI({
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
  text: string
  setText: (v: string) => void
  voice: string
  setVoice: (v: string) => void
}) {
  const handleGenerate = () => {
    if (!text.trim()) return
    generate({ text: text.trim(), voice })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to convert to speech..."
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={4}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Voice</label>
        <div className="flex flex-wrap gap-2">
          {VOICES.map((v) => (
            <button
              key={v}
              onClick={() => setVoice(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voice === v
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={!text.trim() || isLoading}
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
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
          <p className="text-sm text-gray-400">
            Format: {result.format}
            {result.duration && ` | Duration: ${result.duration}s`}
          </p>
          <audio src={result.audioUrl} controls className="w-full" />
        </div>
      )}
    </div>
  )
}

function SpeechGenerationPage() {
  const [mode, setMode] = useState<'streaming' | 'direct' | 'server-fn'>(
    'streaming',
  )

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Text-to-Speech</h2>
            <p className="text-sm text-gray-400 mt-1">
              Convert text to spoken audio using OpenAI TTS
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
            <StreamingSpeechGeneration key="streaming" />
          ) : mode === 'direct' ? (
            <DirectSpeechGeneration key="direct" />
          ) : (
            <ServerFnSpeechGeneration key="server-fn" />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/speech')({
  component: SpeechGenerationPage,
})
