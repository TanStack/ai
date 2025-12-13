import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Loader2, Volume2 } from 'lucide-react'

type Voice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'sage'
  | 'shimmer'
  | 'verse'
type Model = 'tts-1' | 'tts-1-hd' | 'gpt-4o-audio-preview'
type Format = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

interface TTSResult {
  id: string
  model: string
  audio: string
  format: string
  contentType?: string
  duration?: number
}

const VOICES: Array<{ value: Voice; label: string }> = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'nova', label: 'Nova' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
]

const MODELS: Array<{ value: Model; label: string }> = [
  { value: 'tts-1', label: 'TTS-1 (Fast)' },
  { value: 'tts-1-hd', label: 'TTS-1-HD (High Quality)' },
  { value: 'gpt-4o-audio-preview', label: 'GPT-4o Audio (Preview)' },
]

const FORMATS: Array<{ value: Format; label: string }> = [
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'pcm', label: 'PCM' },
]

function TTSPage() {
  const [text, setText] = useState(
    'Hello! Welcome to TanStack AI. This is a demonstration of text-to-speech synthesis.',
  )
  const [voice, setVoice] = useState<Voice>('nova')
  const [model, setModel] = useState<Model>('tts-1')
  const [format, setFormat] = useState<Format>('mp3')
  const [speed, setSpeed] = useState(1.0)
  const [result, setResult] = useState<TTSResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice,
          model,
          format,
          speed,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate speech')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!result) return

    const mimeType = result.contentType || `audio/${result.format}`
    const byteCharacters = atob(result.audio)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `speech-${result.id}.${result.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const audioSrc = result
    ? `data:${result.contentType || `audio/${result.format}`};base64,${result.audio}`
    : undefined

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Volume2 className="w-8 h-8 text-emerald-500" />
          <h1 className="text-2xl font-bold text-white">Text-to-Speech</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Text
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isLoading}
                rows={6}
                maxLength={4096}
                className="w-full rounded-lg border border-emerald-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                placeholder="Enter text to convert to speech..."
              />
              <p className="mt-1 text-xs text-gray-500">
                {text.length} / 4096 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Voice
                </label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value as Voice)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-emerald-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {VOICES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as Model)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-emerald-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-emerald-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Speed ({speed.toFixed(2)}x)
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  disabled={isLoading}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading || !text.trim()}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5" />
                  Generate Speech
                </>
              )}
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-gray-800 rounded-lg p-6 border border-emerald-500/20">
            <h2 className="text-lg font-semibold text-white mb-4">
              Generated Audio
            </h2>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {result ? (
              <div className="space-y-4">
                <div className="relative group">
                  <audio
                    ref={audioRef}
                    src={audioSrc}
                    controls
                    className="w-full rounded-lg"
                  />
                  <button
                    onClick={handleDownload}
                    className="absolute top-2 right-2 p-2 bg-gray-900/80 hover:bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download audio"
                  >
                    <Download className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div className="pt-4 border-t border-gray-700 text-sm text-gray-400">
                  <p>
                    Model:{' '}
                    <span className="text-emerald-400">{result.model}</span>
                  </p>
                  <p>
                    Voice: <span className="text-emerald-400">{voice}</span>
                  </p>
                  <p>
                    Format:{' '}
                    <span className="text-emerald-400">{result.format}</span>
                  </p>
                  {result.duration && (
                    <p>
                      Duration:{' '}
                      <span className="text-emerald-400">
                        {result.duration}s
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : !error && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <Volume2 className="w-16 h-16 mb-4 opacity-50" />
                <p>Enter text and click "Generate Speech" to create audio.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/tts')({
  component: TTSPage,
})
