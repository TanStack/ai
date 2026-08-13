import { useState } from 'react'
import type { Provider } from '@/lib/types'

interface EmbeddingUIProps {
  provider: Provider
  testId?: string
  aimockPort?: number
}

interface EmbeddingApiResult {
  embeddings: Array<Array<number>>
  model: string
}

/**
 * Minimal embedding harness page. `embed()` is Promise-based (no streaming
 * mode), so a single fetch to the dedicated `/api/embedding` route is the
 * whole flow — no connection-adapter/mode variants like the streaming
 * features. The textarea takes one input text per line and the page renders
 * one `embedding-vector` element per returned vector, reporting its
 * dimension count.
 */
export function EmbeddingUI({
  provider,
  testId,
  aimockPort,
}: EmbeddingUIProps) {
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EmbeddingApiResult | null>(null)

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const texts = text
        .split('\n')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
      const res = await fetch('/api/embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, texts, testId, aimockPort }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const message =
          data && typeof data === 'object' && 'error' in data
            ? String(data.error)
            : `HTTP ${res.status}`
        throw new Error(message)
      }
      setResult(data as EmbeddingApiResult)
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="One text per line..."
          rows={3}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          data-testid="generate-button"
          onClick={handleGenerate}
          disabled={!text.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Embed
        </button>
      </div>
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
          <div data-testid="embedding-model" className="text-gray-400 text-sm">
            {result.model}
          </div>
          {result.embeddings.map((vector, index) => (
            <div
              key={index}
              data-testid="embedding-vector"
              data-dimensions={vector.length}
              className="text-gray-200 text-sm"
            >
              {vector.length}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
