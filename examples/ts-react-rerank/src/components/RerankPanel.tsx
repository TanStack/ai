import { useState } from 'react'
import { ArrowRight, Loader2, TriangleAlert } from 'lucide-react'
import {
  MODELS_BY_PROVIDER,
  PROVIDERS,
  PROVIDER_ENV_VARS,
  PROVIDER_LABELS,
  defaultModelFor,
  isProvider,
} from '@/lib/models'
import { EXAMPLE_QUERIES, SUPPORT_DOCS } from '@/lib/documents'
import { rerankDocumentsFn } from '@/lib/server-functions'
import type { SupportDoc } from '@/lib/documents'
import type { Provider } from '@/lib/models'
import type { RerankResult } from '@tanstack/ai'

function scoreColor(score: number): string {
  if (score >= 0.5) return 'bg-emerald-500'
  if (score >= 0.1) return 'bg-amber-500'
  return 'bg-gray-600'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function RerankPanel() {
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0] ?? '')
  const [provider, setProvider] = useState<Provider>('cohere')
  const [model, setModel] = useState(() => defaultModelFor('cohere'))
  const [topN, setTopN] = useState(5)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RerankResult<SupportDoc> | null>(null)

  function changeProvider(next: Provider) {
    setProvider(next)
    setModel(defaultModelFor(next))
  }

  async function run() {
    setIsRunning(true)
    setError(null)
    try {
      const data = await rerankDocumentsFn({
        data: { query, provider, model, topN },
      })
      setResult(data)
    } catch (caught) {
      setError(errorMessage(caught))
      setResult(null)
    } finally {
      setIsRunning(false)
    }
  }

  const usage = result?.usage

  return (
    <div className="space-y-6">
      {/* ---------- Controls ---------- */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                query === example
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {example}
            </button>
          ))}
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run()
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-gray-300">Query</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What is the user actually asking for?"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-300">
                Provider
              </span>
              <select
                value={provider}
                onChange={(event) => {
                  const next = event.target.value
                  if (isProvider(next)) changeProvider(next)
                }}
                className="mt-1 block rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              >
                {PROVIDERS.map((entry) => (
                  <option key={entry} value={entry}>
                    {PROVIDER_LABELS[entry]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block grow">
              <span className="text-sm font-medium text-gray-300">Model</span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="mt-1 block w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              >
                {MODELS_BY_PROVIDER[provider].map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-300">top N</span>
              <input
                type="number"
                min={1}
                max={SUPPORT_DOCS.length}
                value={topN}
                onChange={(event) =>
                  setTopN(Number.parseInt(event.target.value, 10) || 1)
                }
                className="mt-1 block w-24 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isRunning || query.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {isRunning ? 'Reranking…' : 'Rerank'}
          </button>
        </form>
      </div>

      {/* ---------- Error ---------- */}
      {error !== null && (
        <div className="flex gap-3 rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-200">
          <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Rerank failed</p>
            <p className="text-sm text-red-300/90 mt-1">{error}</p>
            <p className="text-sm text-red-300/70 mt-2">
              Set{' '}
              <code className="font-mono">{PROVIDER_ENV_VARS[provider]}</code>{' '}
              in <code className="font-mono">.env</code> and restart the dev
              server.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Results ---------- */}
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Original order
          </h2>
          <ol className="space-y-2">
            {SUPPORT_DOCS.map((doc, index) => (
              <li
                key={doc.id}
                className="flex gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3"
              >
                <span className="font-mono text-xs text-gray-500 pt-0.5">
                  {index + 1}
                </span>
                <span className="text-sm text-gray-300">{doc.title}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Reranked{result ? ` — top ${result.ranking.length}` : ''}
          </h2>

          {result === null ? (
            <p className="rounded-lg border border-dashed border-gray-700 p-6 text-sm text-gray-500">
              Run a query to see the model reorder these documents by relevance.
            </p>
          ) : (
            <>
              <ol className="space-y-2">
                {result.ranking.map((entry, position) => (
                  <li
                    key={entry.document.id}
                    className="rounded-lg border border-gray-700 bg-gray-800/60 p-3"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-purple-400 pt-0.5">
                        {position + 1}
                      </span>
                      {/* `entry.document` is the original SupportDoc object,
                          typed — no id lookup needed. */}
                      <span className="text-sm text-white grow">
                        {entry.document.title}
                      </span>
                      <span
                        className="font-mono text-xs text-gray-400 shrink-0"
                        title="relevance score"
                      >
                        {entry.score.toFixed(3)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                      <div
                        className={`h-full rounded-full ${scoreColor(entry.score)}`}
                        style={{
                          width: `${Math.max(entry.score * 100, 1)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      was #{entry.index + 1} in the original order
                    </p>
                  </li>
                ))}
              </ol>

              <dl className="mt-4 rounded-lg border border-gray-800 bg-gray-900/60 p-3 text-xs text-gray-400 space-y-1">
                <div className="flex justify-between gap-4">
                  <dt>model</dt>
                  <dd className="font-mono text-gray-300">{result.model}</dd>
                </div>
                {usage?.unitsBilled !== undefined && (
                  <div className="flex justify-between gap-4">
                    <dt>search units billed</dt>
                    <dd className="font-mono text-gray-300">
                      {usage.unitsBilled}
                    </dd>
                  </div>
                )}
                {usage !== undefined && usage.totalTokens > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt>total tokens</dt>
                    <dd className="font-mono text-gray-300">
                      {usage.totalTokens}
                    </dd>
                  </div>
                )}
                {usage?.cost !== undefined && (
                  <div className="flex justify-between gap-4">
                    <dt>cost</dt>
                    <dd className="font-mono text-gray-300">
                      ${usage.cost.toFixed(6)}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
