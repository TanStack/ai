import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { DEFAULT_BUDGET, budgets, spend, upsert } from '@/db/collections'
import type { BudgetRow, SpendRow } from '@/db/collections'

export const Route = createFileRoute('/spend')({
  component: Spend,
})

interface Row {
  threadId: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  budget: number
  over: boolean
}

function Spend() {
  const { data: spendRows = [] } = useLiveQuery((q) => q.from({ s: spend }))
  const { data: budgetRows = [] } = useLiveQuery((q) => q.from({ b: budgets }))

  const rows: Array<Row> = (spendRows as Array<SpendRow>).map((s) => {
    const budget =
      (budgetRows as Array<BudgetRow>).find((b) => b.threadId === s.threadId)
        ?.maxTokens ?? DEFAULT_BUDGET
    return {
      threadId: s.threadId,
      totalTokens: s.totalTokens,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      budget,
      over: s.totalTokens > budget,
    }
  })

  const total = rows.reduce((sum, r) => sum + r.totalTokens, 0)
  const overCount = rows.filter((r) => r.over).length

  const setBudget = (threadId: string, maxTokens: number) => {
    upsert(budgets, { id: threadId, threadId, maxTokens }, (draft) => {
      draft.maxTokens = maxTokens
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Spend</h1>
        <span className="ml-auto text-sm text-white/50">
          {total.toLocaleString()} tokens across {rows.length} session
          {rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {overCount > 0 && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/[0.08] px-4 py-2 text-sm text-rose-200">
          ⚠ {overCount} session{overCount === 1 ? '' : 's'} over budget
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-white/40">
          No spend yet. Run a session to see tokens accrue here live.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <SpendChart rows={rows} />
          </div>

          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/40">
              <tr>
                <th className="py-1">Session</th>
                <th className="py-1">In</th>
                <th className="py-1">Out</th>
                <th className="py-1">Total</th>
                <th className="py-1">Budget</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.threadId} className="border-t border-white/5">
                  <td className="py-2 font-mono text-xs">{r.threadId}</td>
                  <td className="py-2">{r.inputTokens.toLocaleString()}</td>
                  <td className="py-2">{r.outputTokens.toLocaleString()}</td>
                  <td className="py-2">{r.totalTokens.toLocaleString()}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      value={r.budget}
                      onChange={(e) =>
                        setBudget(r.threadId, Number(e.target.value) || 0)
                      }
                      className="w-24 rounded border border-white/15 bg-transparent px-2 py-0.5 text-xs outline-none"
                    />
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.over
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {r.over ? 'over budget' : 'ok'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

/**
 * A small SSR-safe SVG bar chart of tokens per session, with each session's
 * budget drawn as a reference line. (react-charts 0.18 auto-sizing can loop its
 * ResizeObserver and freeze the main thread, so we render plain SVG instead.)
 */
function SpendChart({ rows }: { rows: Array<Row> }) {
  const max = Math.max(...rows.map((r) => Math.max(r.totalTokens, r.budget)), 1)
  const barH = 26
  const gap = 12
  const labelW = 160
  const trackW = 520
  const height = rows.length * (barH + gap)
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${labelW + trackW + 70} ${height}`}
      role="img"
      aria-label="Tokens per session"
      style={{ display: 'block' }}
    >
      {rows.map((r, i) => {
        const y = i * (barH + gap)
        const w = (r.totalTokens / max) * trackW
        const budgetX = labelW + (r.budget / max) * trackW
        return (
          <g key={r.threadId}>
            <text
              x={0}
              y={y + barH / 2 + 4}
              fill="#8a93a6"
              fontSize={11}
              fontFamily="monospace"
            >
              {r.threadId.length > 20
                ? `${r.threadId.slice(0, 19)}…`
                : r.threadId}
            </text>
            <rect
              x={labelW}
              y={y}
              width={trackW}
              height={barH}
              fill="#141922"
              rx={4}
            />
            <rect
              x={labelW}
              y={y}
              width={w}
              height={barH}
              fill={r.over ? '#f43f5e' : '#5cc8ff'}
              rx={4}
            />
            <line
              x1={budgetX}
              x2={budgetX}
              y1={y - 2}
              y2={y + barH + 2}
              stroke="#e6e8ee"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text
              x={labelW + trackW + 8}
              y={y + barH / 2 + 4}
              fill="#e6e8ee"
              fontSize={11}
            >
              {r.totalTokens.toLocaleString()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
