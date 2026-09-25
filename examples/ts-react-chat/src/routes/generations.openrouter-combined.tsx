import { useId, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { CitySchema, COMBINED_MODELS } from './api.openrouter-combined'
import type {
  CityResult,
  CombinedModeStats,
  CombinedModel,
} from './api.openrouter-combined'
import type { StreamChunk } from '@tanstack/ai'

const SAMPLE_PROMPT =
  'Call lookup_city_code for Paris, then return the structured object with city, code, and a one-sentence summary.'

type Provider = 'openrouter' | 'openrouter-responses'

function isProvider(value: string): value is Provider {
  return value === 'openrouter' || value === 'openrouter-responses'
}

function isCombinedModel(value: string): value is CombinedModel {
  return COMBINED_MODELS.some((option) => option.value === value)
}

function isPhaseCounts(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every((item) => typeof item === 'number')
}

function isCombinedStats(value: unknown): value is CombinedModeStats {
  if (typeof value !== 'object' || value === null) return false
  if (
    !('supportsCombined' in value) ||
    !('chatStreamCalls' in value) ||
    !('chatStreamWithSchema' in value) ||
    !('structuredOutputStreamCalls' in value) ||
    !('structuredOutputCalls' in value) ||
    !('nativeCombined' in value)
  ) {
    return false
  }
  return (
    typeof value.supportsCombined === 'boolean' &&
    typeof value.chatStreamCalls === 'number' &&
    typeof value.chatStreamWithSchema === 'number' &&
    typeof value.structuredOutputStreamCalls === 'number' &&
    typeof value.structuredOutputCalls === 'number' &&
    typeof value.nativeCombined === 'boolean'
  )
}

function OpenRouterCombinedPage() {
  const providerId = useId()
  const modelId = useId()
  const promptId = useId()
  const statusId = useId()
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT)
  const [provider, setProvider] = useState<Provider>('openrouter')
  const [model, setModel] = useState<CombinedModel>('openai/gpt-5.5')
  const [error, setError] = useState<string | null>(null)
  const [phaseCounts, setPhaseCounts] = useState<Record<string, number> | null>(
    null,
  )
  const [combined, setCombined] = useState<CombinedModeStats | null>(null)

  const resetLocal = () => {
    setError(null)
    setPhaseCounts(null)
    setCombined(null)
  }

  const handleChunk = (chunk: StreamChunk) => {
    if (chunk.type !== EventType.CUSTOM) return

    if (chunk.name === 'combined-mode' && isCombinedStats(chunk.value)) {
      setCombined(chunk.value)
    } else if (chunk.name === 'phase-counts' && isPhaseCounts(chunk.value)) {
      setPhaseCounts(chunk.value)
    }
  }

  const chat = useChat({
    threadId: 'openrouter-combined:useChat',
    outputSchema: CitySchema,
    connection: fetchServerSentEvents('/api/openrouter-combined'),
    forwardedProps: { provider, model },
    onChunk: handleChunk,
    onError: (err) => {
      setError(err.message)
    },
  })

  const toolCalls = chat.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'tool-call')

  const result: CityResult | null = chat.final ?? null
  const isLoading = chat.isLoading
  const structuredOutputPhase = phaseCounts?.structuredOutput ?? 0
  const nativeCombined =
    combined?.nativeCombined === true && structuredOutputPhase === 0

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    resetLocal()
    chat.clear()
    await chat.sendMessage(prompt.trim())
  }

  const handleAbort = () => {
    chat.stop()
    setError('Aborted')
  }

  const handleReset = () => {
    resetLocal()
    chat.clear()
  }

  return (
    <main className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <h2 className="text-xl font-semibold">OpenRouter combined mode</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          This page calls <code className="text-orange-400">chat()</code> with
          both <code className="text-orange-400">tools</code> and{' '}
          <code className="text-orange-400">outputSchema</code>. Native combined
          mode is working when the model calls{' '}
          <code className="text-orange-400">lookup_city_code</code>, returns a
          typed object, and{' '}
          <code className="text-orange-400">structuredOutputStream</code> stays
          at 0.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor={providerId} className="text-sm text-gray-400">
                OpenRouter endpoint
              </label>
              <select
                id={providerId}
                value={provider}
                onChange={(event) => {
                  const next = event.target.value
                  if (isProvider(next)) setProvider(next)
                }}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              >
                <option value="openrouter">Chat Completions</option>
                <option value="openrouter-responses">Responses beta</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor={modelId} className="text-sm text-gray-400">
                Model
              </label>
              <select
                id={modelId}
                value={model}
                onChange={(event) => {
                  const next = event.target.value
                  if (isCombinedModel(next)) setModel(next)
                }}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              >
                {COMBINED_MODELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={promptId} className="text-sm text-gray-400">
              Prompt
            </label>
            <textarea
              id={promptId}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? 'Running…' : 'Run combined test'}
            </button>
            {isLoading && (
              <button
                type="button"
                onClick={handleAbort}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Abort
              </button>
            )}
            {(result || toolCalls.length > 0 || combined) && !isLoading && (
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <p id={statusId} className="text-sm text-gray-400" aria-live="polite">
            {isLoading
              ? 'Waiting for the tool call and the typed object. This can take about 30 seconds.'
              : nativeCombined
                ? 'Native combined mode is on. structuredOutputStream stayed at 0.'
                : combined
                  ? 'Legacy path ran. structuredOutputStream or the structuredOutput phase was used.'
                  : 'Ready. Use the sample prompt, then click Run combined test.'}
          </p>

          {error && (
            <div
              role="alert"
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {toolCalls.length > 0 && (
            <section
              aria-labelledby="tool-calls-heading"
              className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg space-y-3"
            >
              <h3 id="tool-calls-heading" className="text-sm font-semibold">
                Tool calls
              </h3>
              <ul className="space-y-3">
                {toolCalls.map((part) => (
                  <li
                    key={part.id}
                    className="rounded-lg border border-cyan-500/20 bg-gray-900/40 p-3"
                  >
                    <p className="font-mono text-sm text-cyan-300">
                      {part.name}{' '}
                      <span className="text-gray-400">({part.state})</span>
                    </p>
                    <pre className="mt-2 overflow-x-auto text-xs text-gray-300 whitespace-pre-wrap">
                      {JSON.stringify(
                        {
                          input: part.input,
                          output: part.output,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(result || chat.partial.city || chat.partial.code) && (
            <section
              aria-labelledby="result-heading"
              aria-busy={isLoading}
              className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2"
            >
              <h3 id="result-heading" className="text-sm font-semibold">
                Typed object
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-gray-400">city</dt>
                <dd>{result?.city ?? chat.partial.city ?? '…'}</dd>
                <dt className="text-gray-400">code</dt>
                <dd className="font-mono">
                  {result?.code ?? chat.partial.code ?? '…'}
                </dd>
                <dt className="text-gray-400">summary</dt>
                <dd>{result?.summary ?? chat.partial.summary ?? '…'}</dd>
              </dl>
            </section>
          )}

          {combined && (
            <section
              aria-labelledby="verdict-heading"
              className={`p-4 border rounded-lg ${
                nativeCombined
                  ? 'bg-emerald-900/20 border-emerald-700/50'
                  : 'bg-amber-900/20 border-amber-700/50'
              }`}
            >
              <h3 id="verdict-heading" className="text-sm font-semibold mb-3">
                {nativeCombined
                  ? 'Native combined mode'
                  : 'Legacy two-call path'}
              </h3>
              <table className="w-full text-xs font-mono">
                <caption className="sr-only">
                  Adapter call counts for this run
                </caption>
                <thead>
                  <tr className="text-left text-gray-400">
                    <th scope="col" className="py-1 pr-4 font-medium">
                      Check
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      supportsCombinedToolsAndSchema
                    </th>
                    <td>{combined.supportsCombined ? 'true' : 'false'}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      chatStream calls
                    </th>
                    <td>{combined.chatStreamCalls}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      chatStream with outputSchema
                    </th>
                    <td>{combined.chatStreamWithSchema}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      structuredOutputStream calls
                    </th>
                    <td>{combined.structuredOutputStreamCalls}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      structuredOutput calls
                    </th>
                    <td>{combined.structuredOutputCalls}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-4 font-normal">
                      structuredOutput phase chunks
                    </th>
                    <td>{structuredOutputPhase}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">
                Two <code>chatStream</code> calls is the agent loop (tool, then
                final answer). That is not the legacy extra call. The extra call
                is <code>structuredOutputStream</code> and must stay at 0.
              </p>
              {phaseCounts && (
                <ul className="text-xs font-mono mt-3 space-y-1">
                  {Object.entries(phaseCounts).map(([phase, count]) => (
                    <li key={phase}>
                      <span className="text-cyan-300">{phase}</span>
                      {': '}
                      <span className="text-gray-300">
                        {count} chunk{count === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/generations/openrouter-combined')({
  component: OpenRouterCombinedPage,
})
