import { eq, useLiveQuery } from '@tanstack/react-db'
import { approvals, spans } from '@/db/collections'
import { resolveApproval } from '@/lib/session-controller'
import type { ApprovalRow, SpanRow } from '@/db/collections'

export function TraceWaterfall({ channelId }: { channelId: string }) {
  const { data = [] } = useLiveQuery(
    (q) => q.from({ s: spans }).where(({ s }) => eq(s.channelId, channelId)),
    [channelId],
  )
  const rows = data as Array<SpanRow>
  const runs = new Map<string, Array<SpanRow>>()
  for (const row of rows) {
    const group = runs.get(row.runId) ?? []
    group.push(row)
    runs.set(row.runId, group)
  }

  if (rows.length === 0) {
    return <p className="py-10 text-center text-ink-3">No trace data yet.</p>
  }

  return (
    <div className="space-y-4">
      {[...runs].map(([runId, runSpans]) => {
        const start = Math.min(...runSpans.map((span) => span.start))
        const finish = Math.max(
          ...runSpans.map((span) => span.end ?? Date.now()),
        )
        const duration = Math.max(finish - start, 1)
        return (
          <section key={runId} className="space-y-1">
            <div className="flex font-mono text-[11px] text-ink-3">
              <span>{runId}</span>
              <span className="ml-auto">{duration}ms</span>
            </div>
            {[...runSpans]
              .sort((a, b) => a.start - b.start)
              .map((span) => (
                <TraceSpan
                  key={span.id}
                  span={span}
                  start={start}
                  duration={duration}
                />
              ))}
          </section>
        )
      })}
    </div>
  )
}

function TraceSpan({
  span,
  start,
  duration,
}: {
  span: SpanRow
  start: number
  duration: number
}) {
  const left = ((span.start - start) / duration) * 100
  const width = Math.max(
    (((span.end ?? Date.now()) - span.start) / duration) * 100,
    1,
  )
  const approval = span.approvalId
    ? (approvals.get(span.approvalId) as ApprovalRow | undefined)
    : undefined

  return (
    <div className="grid grid-cols-[12rem_1fr_6rem] items-center gap-3 text-xs">
      <span className="truncate font-mono text-ink-2" title={span.name}>
        {span.kind} · {span.name}
      </span>
      <div className="relative h-5 rounded-sm bg-surface-raised">
        <div
          className={`absolute top-1 h-3 rounded-[3px] ${
            span.kind === 'approval'
              ? 'bg-warn'
              : span.kind === 'tool'
                ? 'bg-ink-2'
                : 'bg-ink-3'
          }`}
          style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
        />
      </div>
      {approval?.status === 'pending' ? (
        <span className="flex justify-end gap-1">
          <button
            onClick={() =>
              resolveApproval(approval.threadId, approval.id, 'approve')
            }
            className="btn btn-sm btn-accent px-1.5 py-0.5"
          >
            approve
          </button>
          <button
            onClick={() =>
              resolveApproval(approval.threadId, approval.id, 'deny')
            }
            className="btn btn-sm btn-ghost px-1.5 py-0.5"
          >
            deny
          </button>
        </span>
      ) : (
        <span className="text-right font-mono text-[11px] text-ink-3">
          {span.end ? `${span.end - span.start}ms` : 'running'}
        </span>
      )}
    </div>
  )
}
