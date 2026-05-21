import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react'

interface ReproSuccess {
  ok: true
  fixed: boolean
  result: { answer: string }
  logs: Array<string>
  phasesObservedDuringChunks: Array<string>
  chunksByPhase: Record<string, number>
}

interface ReproFailure {
  ok: false
  error: string
  logs: Array<string>
  phasesObservedDuringChunks: Array<string>
  chunksByPhase: Record<string, number>
}

type ReproResult = ReproSuccess | ReproFailure

function Issue390Page() {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; data: ReproResult }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  async function run() {
    setState({ status: 'running' })
    try {
      const res = await fetch('/api/issue-390-repro', { method: 'POST' })
      const data = (await res.json()) as ReproResult
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
      <h1 className="text-3xl font-bold mb-2">Issue #390 reproduction</h1>
      <p className="text-gray-400 mb-1">
        Runs the exact gist from{' '}
        <a
          href="https://gist.github.com/imsherrill/af39137a58fbfc12c26f8b894e207506"
          target="_blank"
          rel="noreferrer"
          className="text-cyan-400 hover:underline"
        >
          the issue reporter
        </a>{' '}
        against real{' '}
        <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-300">
          geminiText('gemini-2.5-flash')
        </code>
        .
      </p>
      <p className="text-gray-400 mb-6">
        The fix is verified by checking whether middleware observed any chunks
        with{' '}
        <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-300">
          ctx.phase === 'structuredOutput'
        </code>
        . Before the PR this phase didn't exist and the structured-output call
        ran outside the middleware pipeline entirely.
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
        Run reproduction
      </button>

      {state.status === 'error' ? (
        <div className="bg-red-900/40 border border-red-700 p-4 rounded-lg">
          <p className="font-semibold text-red-300">Request failed</p>
          <p className="text-sm text-red-200 mt-1">{state.message}</p>
        </div>
      ) : null}

      {state.status === 'done' && !state.data.ok ? (
        <div className="bg-red-900/40 border border-red-700 p-4 rounded-lg mb-4">
          <p className="font-semibold text-red-300">Server error</p>
          <p className="text-sm text-red-200 mt-1">{state.data.error}</p>
        </div>
      ) : null}

      {state.status === 'done' && state.data.ok ? (
        <>
          <div
            className={`p-4 rounded-lg mb-4 ${
              state.data.fixed
                ? 'bg-emerald-900/40 border border-emerald-700'
                : 'bg-red-900/40 border border-red-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {state.data.fixed ? (
                <>
                  <CheckCircle2 className="text-emerald-400" size={20} />
                  <span className="text-emerald-200">FIXED</span>
                </>
              ) : (
                <>
                  <XCircle className="text-red-400" size={20} />
                  <span className="text-red-200">NOT FIXED</span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-300 mt-2">
              {state.data.fixed
                ? "Middleware observed chunks during the structured-output adapter call — the call now flows through the middleware pipeline."
                : "Middleware never saw the structured-output phase — the bug from the report is still present."}
            </p>
          </div>

          <h2 className="font-semibold mt-6 mb-2">Phases observed by onChunk</h2>
          <ul className="bg-gray-900 rounded p-3 text-sm font-mono">
            {state.data.phasesObservedDuringChunks.map((p) => (
              <li key={p}>
                <span className="text-cyan-300">{p}</span>
                {': '}
                <span className="text-gray-300">
                  {state.data.chunksByPhase[p]} chunk
                  {state.data.chunksByPhase[p] === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="font-semibold mt-6 mb-2">Structured result</h2>
          <pre className="bg-gray-900 rounded p-3 text-sm overflow-x-auto">
            {JSON.stringify(state.data.result, null, 2)}
          </pre>

          <h2 className="font-semibold mt-6 mb-2">Middleware logs</h2>
          <pre className="bg-gray-900 rounded p-3 text-sm overflow-x-auto whitespace-pre-wrap">
            {state.data.logs.join('\n')}
          </pre>
        </>
      ) : null}
    </div>
  )
}

export const Route = createFileRoute('/issue-390-repro')({
  component: Issue390Page,
})
