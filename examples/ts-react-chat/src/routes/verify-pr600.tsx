import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react'

interface ScenarioResult {
  id: string
  title: string
  description: string
  pass: boolean
  observed: Record<string, unknown>
}

interface VerifyResponse {
  results: Array<ScenarioResult>
  allPass: boolean
}

function VerifyPage() {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; data: VerifyResponse }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  async function run() {
    setState({ status: 'running' })
    try {
      const res = await fetch('/api/verify-pr600', { method: 'POST' })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = (await res.json()) as VerifyResponse
      setState({ status: 'done', data })
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold mb-2">PR #600 Fix Verification</h1>
      <p className="text-gray-400 mb-6">
        Exercises the four review fixes against the real{' '}
        <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-300">
          chat()
        </code>{' '}
        engine with hand-rolled mock adapters. No API keys required.
      </p>

      <button
        onClick={run}
        disabled={state.status === 'running'}
        className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-medium transition-colors mb-6"
      >
        {state.status === 'running' ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <PlayCircle size={18} />
        )}
        Run verification
      </button>

      {state.status === 'error' ? (
        <div className="bg-red-900/40 border border-red-700 p-4 rounded-lg">
          <p className="font-semibold text-red-300">Request failed</p>
          <p className="text-sm text-red-200 mt-1">{state.message}</p>
        </div>
      ) : null}

      {state.status === 'done' ? (
        <>
          <div
            className={`p-3 rounded-lg mb-4 font-semibold ${
              state.data.allPass
                ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200'
                : 'bg-red-900/40 border border-red-700 text-red-200'
            }`}
          >
            {state.data.allPass
              ? `All ${state.data.results.length} scenarios PASS`
              : `${state.data.results.filter((r) => !r.pass).length}/${state.data.results.length} scenarios FAILED`}
          </div>

          <ul className="space-y-3">
            {state.data.results.map((r) => (
              <li
                key={r.id}
                className={`p-4 rounded-lg border ${
                  r.pass
                    ? 'bg-emerald-950/30 border-emerald-800'
                    : 'bg-red-950/30 border-red-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {r.pass ? (
                    <CheckCircle2
                      size={20}
                      className="text-emerald-400 mt-0.5 shrink-0"
                    />
                  ) : (
                    <XCircle
                      size={20}
                      className="text-red-400 mt-0.5 shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{r.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {r.description}
                    </p>
                    <pre className="text-xs bg-gray-900 mt-3 p-2 rounded overflow-x-auto">
                      {JSON.stringify(r.observed, null, 2)}
                    </pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export const Route = createFileRoute('/verify-pr600')({
  component: VerifyPage,
})
