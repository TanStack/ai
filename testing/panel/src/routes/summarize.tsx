import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FileText, Loader2, Zap } from 'lucide-react'

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

interface SummarizeProvider {
  id: Provider
  name: string
}

const PROVIDERS: Array<SummarizeProvider> = [
  { id: 'openai', name: 'OpenAI (GPT-4o Mini)' },
  { id: 'anthropic', name: 'Anthropic (Claude Sonnet)' },
  { id: 'gemini', name: 'Gemini (2.0 Flash)' },
  { id: 'grok', name: 'Grok (Grok 3 Mini)' },
  { id: 'ollama', name: 'Ollama (Mistral 7B)' },
  { id: 'openrouter', name: 'OpenRouter (GPT-4o Mini)' },
]

const SAMPLE_TEXT = `Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to natural intelligence displayed by animals including humans. AI research has been defined as the field of study of intelligent agents, which refers to any system that perceives its environment and takes actions that maximize its chance of achieving its goals.

The term "artificial intelligence" had previously been used to describe machines that mimic and display "human" cognitive skills that are associated with the human mind, such as "learning" and "problem-solving". This definition has since been rejected by major AI researchers who now describe AI in terms of rationality and acting rationally, which does not limit how intelligence can be articulated.

AI applications include advanced web search engines, recommendation systems, understanding human speech, self-driving cars, automated decision-making and competing at the highest level in strategic game systems. As machines become increasingly capable, tasks considered to require "intelligence" are often removed from the definition of AI, a phenomenon known as the AI effect.`

function SummarizePage() {
  const [text, setText] = useState(SAMPLE_TEXT)
  const [provider, setProvider] = useState<Provider>('openai')
  const [maxLength, setMaxLength] = useState(100)
  const [style, setStyle] = useState<'concise' | 'detailed' | 'bullet-points'>(
    'concise',
  )
  const [useStreaming, setUseStreaming] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedProvider, setUsedProvider] = useState<string | null>(null)
  const [usedModel, setUsedModel] = useState<string | null>(null)
  const [chunkCount, setChunkCount] = useState<number>(0)

  const handleSummarize = async () => {
    setIsLoading(true)
    setError(null)
    setSummary(null)
    setChunkCount(0)

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          provider,
          maxLength,
          style,
          stream: useStreaming,
        }),
      })

      if (useStreaming) {
        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let chunks = 0
        let accumulatedSummary = ''

        if (!reader) {
          throw new Error('No response body')
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'error') {
                  throw new Error(parsed.error)
                }
                // Handle TEXT_MESSAGE_CONTENT chunks from the summarize stream
                if (parsed.type === 'TEXT_MESSAGE_CONTENT') {
                  chunks++
                  setChunkCount(chunks)
                  // Accumulate delta or use content if provided
                  if (parsed.delta) {
                    accumulatedSummary += parsed.delta
                  } else if (parsed.content) {
                    accumulatedSummary = parsed.content
                  }
                  setSummary(accumulatedSummary)
                  setUsedProvider(parsed.provider)
                  setUsedModel(parsed.model)
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } else {
        // Handle non-streaming response
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to summarize')
        }

        setSummary(data.summary)
        setUsedProvider(data.provider)
        setUsedModel(data.model)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-white">Text Summarization</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Length (words)
                </label>
                <input
                  type="number"
                  value={maxLength}
                  onChange={(e) =>
                    setMaxLength(parseInt(e.target.value) || 100)
                  }
                  min={20}
                  max={500}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Style
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as any)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="concise">Concise</option>
                  <option value="detailed">Detailed</option>
                  <option value="bullet-points">Bullet Points</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  disabled={isLoading}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              </label>
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <Zap className="w-4 h-4 text-orange-500" />
                Enable Streaming
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Text to Summarize
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isLoading}
                rows={12}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                placeholder="Enter text to summarize..."
              />
            </div>

            <button
              onClick={handleSummarize}
              disabled={isLoading || !text.trim()}
              className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {useStreaming ? 'Streaming...' : 'Summarizing...'}
                </>
              ) : (
                <>
                  {useStreaming && <Zap className="w-4 h-4" />}
                  {useStreaming ? 'Stream Summary' : 'Summarize'}
                </>
              )}
            </button>
          </div>

          {/* Output Panel */}
          <div className="bg-gray-800 rounded-lg p-6 border border-orange-500/20">
            <h2 className="text-lg font-semibold text-white mb-4">Summary</h2>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {summary ? (
              <div className="space-y-4">
                <div className="text-gray-300 whitespace-pre-wrap">
                  {summary}
                </div>
                <div className="pt-4 border-t border-gray-700 text-sm text-gray-400">
                  <p>
                    Provider:{' '}
                    <span className="text-orange-400">{usedProvider}</span>
                  </p>
                  <p>
                    Model: <span className="text-orange-400">{usedModel}</span>
                  </p>
                  {chunkCount > 0 && (
                    <p>
                      Streaming:{' '}
                      <span className="text-orange-400">
                        {chunkCount} chunks
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : !error && !isLoading ? (
              <p className="text-gray-500">
                Enter some text and click "Summarize" to generate a summary.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/summarize')({
  component: SummarizePage,
})
