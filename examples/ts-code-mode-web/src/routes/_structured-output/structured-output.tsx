import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Code, Play, Sparkles, Loader2 } from 'lucide-react'
import { Header } from '@/components'

export const Route = createFileRoute('/_structured-output/structured-output')({
  component: StructuredOutputPage,
})

const FIXED_PROMPT =
  'Use city tools to compare Tokyo and Barcelona. Then produce a concise travel recommendation report with key findings and practical next steps.'

function StructuredOutputPage() {
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const runDemo = useCallback(async () => {
    setResult(null)
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/structured-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: FIXED_PROMPT,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Request failed')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />

      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        <div className="border-b border-pink-500/20 bg-gray-800 p-4 space-y-3">
          <p className="text-sm text-gray-400">Fixed prompt:</p>
          <p className="text-sm text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-3">
            {FIXED_PROMPT}
          </p>

          <button
            onClick={runDemo}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-medium disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isLoading ? 'Running...' : 'Run Demo'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!result && !error && !isLoading && (
            <div className="flex-1 flex items-center justify-center text-gray-400 px-8 pt-16">
              <div className="max-w-2xl text-center space-y-3">
                <Sparkles className="w-10 h-10 mx-auto text-pink-400/80" />
                <p className="text-lg font-medium">Structured Output Demo</p>
                <p className="text-sm text-gray-500">
                  Click Run Demo. The model will use Code Mode tools to research
                  cities, then return structured JSON.
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-sm text-pink-300 animate-pulse">
              Running Code Mode and generating structured output...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-300 border border-red-500/30 bg-red-900/20 rounded-lg p-3">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-pink-300">
                <Code className="w-4 h-4" />
                Structured JSON Output
              </div>
              <pre className="text-xs text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
