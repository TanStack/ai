import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretRightIcon } from '@phosphor-icons/react'
import { PageHeader } from '@/components/ui'

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
  running: 'bg-ui text-ink-2',
  completed: 'bg-ok-soft text-ok',
  failed: 'bg-err-soft text-err',
  interrupted: 'bg-warn-soft text-warn',
}

function History() {
  const queryClient = useQueryClient()
  const runs = useQuery<{ protocolVersion: number; runs: Array<Run> }>({
    queryKey: ['runs'],
    queryFn: () => fetch('/api/runs').then((r) => r.json()),
  })
  // The host announces each session change and status change, so refetch then.
  useEffect(() => {
    const source = new EventSource('/api/harness/host-events')
    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] })
    }
    return () => source.close()
  }, [queryClient])

  const items = runs.data?.runs ?? []

  return (
    <div className="px-8 py-7">
      <PageHeader
        title="History"
        sub={`${items.length} run${items.length === 1 ? '' : 's'} · backed by HarnessPersistence`}
      />

      {items.length === 0 ? (
        <p className="text-ink-3">
          No runs yet. Start a session, then replay it here.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((run) => (
            <li key={run.runId}>
              <a
                href={`/sessions/${run.threadId}`}
                className="flex items-center gap-4 px-2 py-3 transition-colors duration-150 hover:bg-ui-hover"
              >
                <span className="font-mono text-xs">{run.threadId}</span>
                <span className="text-xs text-ink-3">{run.kind}</span>
                <span
                  className={`pill ml-auto ${statusStyle[run.status] ?? 'bg-ui text-ink-3'}`}
                >
                  {run.status}
                </span>
                <span className="w-44 text-right font-mono text-[11px] text-ink-3">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-2">
                  replay
                  <CaretRightIcon size={12} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
