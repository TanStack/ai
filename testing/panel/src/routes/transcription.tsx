import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Mic, Upload } from 'lucide-react'

type Model =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-transcribe-diarize'
type ResponseFormat = 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'

interface TranscriptionSegment {
  id: number
  start: number
  end: number
  text: string
  confidence?: number
  speaker?: string
}

interface TranscriptionResult {
  id: string
  model: string
  text: string
  language?: string
  duration?: number
  segments?: Array<TranscriptionSegment>
  words?: Array<{ word: string; start: number; end: number }>
}

const MODELS: Array<{ value: Model; label: string }> = [
  { value: 'whisper-1', label: 'Whisper-1' },
  { value: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
  { value: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe' },
  { value: 'gpt-4o-transcribe-diarize', label: 'GPT-4o Transcribe (Diarize)' },
]

const FORMATS: Array<{ value: ResponseFormat; label: string }> = [
  { value: 'verbose_json', label: 'Verbose JSON (with timestamps)' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Plain Text' },
  { value: 'srt', label: 'SRT Subtitles' },
  { value: 'vtt', label: 'VTT Subtitles' },
]

const LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
]

function TranscriptionPage() {
  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState<Model>('whisper-1')
  const [language, setLanguage] = useState('')
  const [responseFormat, setResponseFormat] =
    useState<ResponseFormat>('verbose_json')
  const [result, setResult] = useState<TranscriptionResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('audio/')) {
      setFile(droppedFile)
      setError(null)
    } else {
      setError('Please drop a valid audio file')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleTranscribe = async () => {
    if (!file) {
      setError('Please select an audio file')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('audio', file)
      formData.append('model', model)
      formData.append('responseFormat', responseFormat)
      if (language) {
        formData.append('language', language)
      }

      const response = await fetch('/api/transcription', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe audio')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Mic className="w-8 h-8 text-amber-500" />
          <h1 className="text-2xl font-bold text-white">Audio Transcription</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="space-y-4">
            {/* File Upload */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-gray-600 hover:border-amber-500/30 hover:bg-gray-800/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {file ? (
                <div>
                  <p className="text-amber-400 font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-300">
                    Drop an audio file here or click to browse
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports MP3, WAV, M4A, FLAC, OGG, WebM
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as Model)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-amber-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-amber-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Output Format
              </label>
              <select
                value={responseFormat}
                onChange={(e) =>
                  setResponseFormat(e.target.value as ResponseFormat)
                }
                disabled={isLoading}
                className="w-full rounded-lg border border-amber-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleTranscribe}
              disabled={isLoading || !file}
              className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Transcribing...
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Transcribe Audio
                </>
              )}
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-gray-800 rounded-lg p-6 border border-amber-500/20">
            <h2 className="text-lg font-semibold text-white mb-4">
              Transcription Result
            </h2>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {result ? (
              <div className="space-y-4">
                {/* Metadata */}
                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-gray-400">
                      Model:{' '}
                      <span className="text-amber-400">{result.model}</span>
                    </p>
                    {result.language && (
                      <p className="text-gray-400">
                        Language:{' '}
                        <span className="text-amber-400">
                          {result.language}
                        </span>
                      </p>
                    )}
                    {result.duration && (
                      <p className="text-gray-400">
                        Duration:{' '}
                        <span className="text-amber-400">
                          {result.duration.toFixed(1)}s
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Full Text */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">
                    Full Text
                  </h3>
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 max-h-48 overflow-y-auto">
                    <p className="text-gray-100 whitespace-pre-wrap">
                      {result.text}
                    </p>
                  </div>
                </div>

                {/* Segments with timestamps */}
                {result.segments && result.segments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">
                      Segments ({result.segments.length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {result.segments.map((segment) => (
                        <div
                          key={segment.id}
                          className="p-3 bg-gray-900/50 rounded-lg border border-gray-700"
                        >
                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                            <span className="font-mono">
                              {formatTime(segment.start)} -{' '}
                              {formatTime(segment.end)}
                            </span>
                            {segment.speaker && (
                              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                                {segment.speaker}
                              </span>
                            )}
                            {segment.confidence && (
                              <span className="text-gray-600">
                                {(segment.confidence * 100).toFixed(0)}% conf
                              </span>
                            )}
                          </div>
                          <p className="text-gray-200 text-sm">
                            {segment.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : !error && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <Mic className="w-16 h-16 mb-4 opacity-50" />
                <p>Upload an audio file and click "Transcribe Audio"</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/transcription')({
  component: TranscriptionPage,
})
