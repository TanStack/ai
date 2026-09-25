import { useState } from 'react'
import type { Provider } from '@/lib/types'

interface VoiceDesignUIProps {
  provider: Provider
  testId?: string
  aimockPort?: number
}

interface DesignedVoice {
  voiceId: string
  audio?: string
  contentType?: string
  duration?: number
  saved?: boolean
}

interface VoiceApiResult {
  model: string
  previewText?: string
  voices: Array<DesignedVoice>
}

/**
 * Minimal voice-design harness page. `generateVoice()` is Promise-based, so a
 * single fetch to `/api/voice` is the whole flow — no connection-adapter/mode
 * variants, the same shape as the embedding page.
 *
 * The "save to library" checkbox drives the two-step half of the ElevenLabs
 * adapter: with it ticked the first candidate comes back with a library voice
 * id and `saved` set, which is what `data-saved` reports.
 */
export function VoiceDesignUI({
  provider,
  testId,
  aimockPort,
}: VoiceDesignUIProps) {
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [save, setSave] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VoiceApiResult | null>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          prompt,
          ...(save ? { name: name || 'E2E Voice' } : {}),
          testId,
          aimockPort,
        }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data
            ? String(data.error)
            : `HTTP ${res.status}`
        throw new Error(message)
      }
      setResult(data as VoiceApiResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <textarea
          data-testid="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the voice..."
          rows={3}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          data-testid="generate-button"
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Design
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          data-testid="save-voice-toggle"
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
        />
        Save to voice library
      </label>
      {save && (
        <input
          data-testid="voice-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Voice name"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
      )}
      <div data-testid="generation-status">
        {isLoading ? 'loading' : error ? 'error' : result ? 'complete' : 'idle'}
      </div>
      {error && (
        <div data-testid="generation-error" className="text-red-400 text-sm">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-2">
          <div data-testid="voice-model" className="text-gray-400 text-sm">
            {result.model}
          </div>
          {result.previewText && (
            <div
              data-testid="voice-preview-text"
              className="text-gray-400 text-sm"
            >
              {result.previewText}
            </div>
          )}
          {result.voices.map((voice) => (
            <div
              key={voice.voiceId}
              data-testid="designed-voice"
              data-voice-id={voice.voiceId}
              data-saved={voice.saved ? 'true' : 'false'}
              className="text-gray-200 text-sm"
            >
              {voice.voiceId}
              {voice.audio && (
                <audio
                  data-testid="voice-preview-audio"
                  controls
                  src={`data:${voice.contentType ?? 'audio/mpeg'};base64,${voice.audio}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
