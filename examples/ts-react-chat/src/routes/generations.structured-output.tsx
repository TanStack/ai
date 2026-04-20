import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const SAMPLE_PROMPT =
  'I play indie rock and have a $1500 budget. Recommend two electric guitars and one acoustic to round out my rig.'

const OPENROUTER_MODELS = [
  { value: 'openai/gpt-5.2', label: 'OpenAI GPT-5.2' },
  { value: 'openai/gpt-5.2-pro', label: 'OpenAI GPT-5.2 Pro' },
  { value: 'openai/gpt-5.1', label: 'OpenAI GPT-5.1' },
  { value: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
] as const

interface RecommendationResult {
  title: string
  summary: string
  recommendations: Array<{
    name: string
    brand: string
    type: 'acoustic' | 'electric' | 'bass' | 'classical'
    priceRangeUsd: { min: number; max: number }
    reason: string
  }>
  nextSteps: Array<string>
}

function StructuredOutputPage() {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT)
  const [model, setModel] = useState<string>(OPENROUTER_MODELS[0].value)
  const [result, setResult] = useState<RecommendationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/structured-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed')
      }
      setResult(payload.data as RecommendationResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <h2 className="text-xl font-semibold">
          Structured Output (OpenRouter)
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Calls <code className="text-orange-400">chat()</code> with an{' '}
          <code className="text-orange-400">outputSchema</code> via the{' '}
          <code className="text-orange-400">openRouterText</code> adapter and
          parses the JSON result.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="space-y-3">
            <label className="text-sm text-gray-400">OpenRouter Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {OPENROUTER_MODELS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-sm text-gray-400">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want recommendations for..."
              className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              rows={6}
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? 'Generating...' : 'Generate Structured Output'}
            </button>
            {result && (
              <button
                onClick={() => setResult(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <h3 className="text-lg font-semibold text-white">
                  {result.title}
                </h3>
                <p className="text-gray-300 mt-2 text-sm">{result.summary}</p>
              </div>

              <div className="space-y-3">
                {result.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-white font-medium">
                          {rec.brand} {rec.name}
                        </p>
                        <p className="text-xs text-orange-400 uppercase tracking-wider mt-0.5">
                          {rec.type}
                        </p>
                      </div>
                      <p className="text-sm text-gray-400 whitespace-nowrap">
                        ${rec.priceRangeUsd.min} – ${rec.priceRangeUsd.max}
                      </p>
                    </div>
                    <p className="text-sm text-gray-300 mt-2">{rec.reason}</p>
                  </div>
                ))}
              </div>

              {result.nextSteps.length > 0 && (
                <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-2">Next Steps</p>
                  <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
                    {result.nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="p-4 bg-gray-800/30 border border-gray-700/50 rounded-lg">
                <summary className="text-sm text-gray-400 cursor-pointer">
                  Raw JSON
                </summary>
                <pre className="text-xs text-gray-300 mt-3 overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/structured-output')({
  component: StructuredOutputPage,
})
