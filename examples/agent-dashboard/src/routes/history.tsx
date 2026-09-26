import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/history')({
  component: History,
})

interface Run {
  runId: string
  threadId: string
  status: string
  kind: string
  agent: string | null
  startedAt: number
  finishedAt: number | null
}

const statusStyle: Record<string, string> = {
  running: 'bg-sky-500/20 text-sky-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-rose-500/20 text-rose-300',
  interrupted: 'bg-amber-500/20 text-amber-300',
}

function History() {
  const runs = useQuery<{ protocolVersion: number; runs: Array<Run> }>({
    queryKey: ['runs'],
    queryFn: () => fetch('/api/runs').then((r) => r.json()),
    refetchInterval: 3000,
  })

  const items = runs.data?.runs ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Run history</h1>
        <span className="ml-auto text-xs text-white/40">
          {items.length} run{items.length === 1 ? '' : 's'} · backed by
          HarnessPersistence
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-white/40">
          No runs yet. Start a session, then replay it here.
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
          {items.map((run) => (
            <li key={run.runId}>
              <a
                href={`/sessions/${run.threadId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
              >
                <span className="font-mono text-xs text-white/70">
                  {run.threadId}
                </span>
                <span className="text-xs text-white/30">{run.kind}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs ${statusStyle[run.status] ?? 'bg-white/10 text-white/60'}`}
                >
                  {run.status}
                </span>
                <span className="w-40 text-right text-xs text-white/30">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <span className="text-xs text-sky-300">replay →</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
