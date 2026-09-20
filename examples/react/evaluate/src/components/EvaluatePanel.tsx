import { useState } from 'react'
import { ArrowRight, Loader2, TriangleAlert } from 'lucide-react'
import {
  PROVIDERS,
  PROVIDER_ENV_VARS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  isProvider,
} from '@/lib/models'
import { evaluateTicketFn } from '@/lib/server-functions'
import type { Provider } from '@/lib/models'
import type { TicketEvaluateResult } from '@/lib/server-functions'

const SAMPLE_TICKET = `I was charged twice for my Pro plan this month. The extra charge is $29. I need a refund today. My card is already over the limit and I cannot pay rent until this is fixed. Ticket 4821.`

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function envVarsLabel(provider: Provider) {
  return PROVIDER_ENV_VARS[provider].join(' and ')
}

function formatNumber(value: number) {
  return value.toFixed(2)
}

export default function EvaluatePanel() {
  const [ticket, setTicket] = useState(SAMPLE_TICKET)
  const [provider, setProvider] = useState<Provider>('typesafe')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TicketEvaluateResult | null>(null)

  async function run() {
    setIsRunning(true)
    setError(null)
    try {
      const data = await evaluateTicketFn({
        data: { ticket, provider },
      })
      setResult(data)
    } catch (caught) {
      setError(errorMessage(caught))
      setResult(null)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run()
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-gray-300">
              Support ticket
            </span>
            <textarea
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              rows={6}
              placeholder="Paste a support ticket"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-300">Provider</span>
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value
                if (isProvider(next)) setProvider(next)
              }}
              className="mt-1 block w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
            >
              {PROVIDERS.map((entry) => (
                <option key={entry} value={entry}>
                  {PROVIDER_LABELS[entry]} ({PROVIDER_MODELS[entry]})
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={isRunning || ticket.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {isRunning ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>

      {error !== null && (
        <div className="flex gap-3 rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-200">
          <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Evaluate failed</p>
            <p className="text-sm text-red-300/90 mt-1">{error}</p>
            <p className="text-sm text-red-300/70 mt-2">
              Set <code className="font-mono">{envVarsLabel(provider)}</code> in{' '}
              <code className="font-mono">.env</code> and restart the dev
              server.
            </p>
          </div>
        </div>
      )}

      {result === null ? (
        <p className="rounded-lg border border-dashed border-gray-700 p-6 text-sm text-gray-500">
          Submit a ticket to see the queue, urgency, and refund answers.
        </p>
      ) : (
        <dl className="rounded-xl border border-gray-700 bg-gray-800/60 p-6 text-sm space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">queue</dt>
            <dd className="font-mono text-white">
              {result.queue.value}{' '}
              <span className="text-gray-400">
                p={formatNumber(result.queue.probability)}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">urgency</dt>
            <dd className="font-mono text-white">
              {result.urgency.value}{' '}
              <span className="text-gray-400">
                score={formatNumber(result.urgency.score)}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">refund</dt>
            <dd className="font-mono text-white">
              {String(result.refund.value)}{' '}
              <span className="text-gray-400">
                p={formatNumber(result.refund.probability)}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 pt-2 border-t border-gray-700">
            <dt className="text-gray-400">model</dt>
            <dd className="font-mono text-gray-300">{result.meta.model}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}
