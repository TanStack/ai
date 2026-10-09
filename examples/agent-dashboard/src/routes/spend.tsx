import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import {
  DEFAULT_BUDGET,
  budgets,
  memberships,
  spend,
  teams,
} from '@/db/collections'
import { WarningIcon } from '@phosphor-icons/react'
import { setBudget } from '@/lib/session-controller'
import { PageHeader, compact } from '@/components/ui'
import type {
  BudgetRow,
  MembershipRow,
  SpendRow,
  TeamRow,
} from '@/db/collections'

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
  cost: number
  teamId?: string
}

function Spend() {
  const { data: spendRows = [] } = useLiveQuery((q) => q.from({ s: spend }))
  const { data: budgetRows = [] } = useLiveQuery((q) => q.from({ b: budgets }))
  const { data: memberRows = [] } = useLiveQuery((q) =>
    q.from({ m: memberships }),
  )
  const { data: teamRows = [] } = useLiveQuery((q) => q.from({ t: teams }))

  const rows: Array<Row> = (spendRows as Array<SpendRow>).map((s) => {
    const member = (memberRows as Array<MembershipRow>).find(
      (candidate) => candidate.threadId === s.threadId,
    )
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
      cost: s.cost,
      teamId: member?.teamId,
    }
  })

  const total = rows.reduce((sum, r) => sum + r.totalTokens, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const overCount = rows.filter((r) => r.over).length
  const teamNames = new Map(
    (teamRows as Array<TeamRow>).map((team) => [team.id, team.name]),
  )
  const teamTotals = new Map<string, number>()
  for (const row of rows) {
    if (!row.teamId) continue
    teamTotals.set(row.teamId, (teamTotals.get(row.teamId) ?? 0) + row.cost)
  }

  const totalBudget = rows.reduce((sum, r) => sum + r.budget, 0) || 1
  const used = total / totalBudget

  return (
    <div className="px-8 py-7">
      <PageHeader
        title="Spend"
        sub={`$${totalCost.toFixed(4)} · ${total.toLocaleString()} tokens across ${rows.length} session${rows.length === 1 ? '' : 's'}`}
      />

      <div className="grid grid-cols-[1.3fr_1fr_1.2fr] items-end gap-12 border-b border-line pb-8">
        <div>
          <div className="text-[13px] text-ink-2">Tokens</div>
          <div className="font-display text-[88px] leading-[0.9] font-bold tracking-[-0.03em]">
            {compact(total)}
          </div>
          <div className="mt-2 text-xs text-ink-3">
            {compact(rows.reduce((sum, r) => sum + r.inputTokens, 0))} in ·{' '}
            {compact(rows.reduce((sum, r) => sum + r.outputTokens, 0))} out
          </div>
        </div>
        <div>
          <div className="text-[13px] text-ink-2">Cost</div>
          <div className="font-display text-[56px] leading-[0.9] font-bold tracking-[-0.02em] text-ink-2">
            ${totalCost.toFixed(2)}
          </div>
          <div className="mt-2 text-xs text-ink-3">
            estimated from model pricing
          </div>
        </div>
        {rows.length > 0 && (
          <div>
            <div className="mb-2 flex justify-between text-[13px] text-ink-2">
              <span>Boundary · {compact(totalBudget)} tok</span>
              <span>{Math.round(used * 100)}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-line-strong">
              <div
                className={`h-full rounded-full ${used > 1 ? 'bg-err' : 'bg-ink'}`}
                style={{ width: `${Math.min(used * 100, 100)}%` }}
              />
              <span className="absolute -top-1 left-[80%] h-4 w-px bg-warn" />
            </div>
            <div className="mt-2 text-xs text-ink-3">
              Sum of per-session budgets. Alert at 80%.
            </div>
          </div>
        )}
      </div>

      {overCount > 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-md bg-err-soft px-4 py-3 text-[13px] text-err">
          <WarningIcon size={16} />
          {overCount} session{overCount === 1 ? '' : 's'} over budget
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-8 text-ink-3">
          No spend yet. Run a session to see tokens accrue here live.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-[1.5fr_1fr] gap-12">
          <table className="w-full text-left">
            <thead>
              <tr className="label">
                <th className="pb-2 font-normal">Session</th>
                <th className="pb-2 font-normal">Tokens</th>
                <th className="pb-2 font-normal">In / out</th>
                <th className="pb-2 font-normal">Cost</th>
                <th className="pb-2 font-normal">Budget</th>
                <th className="pb-2 font-normal">Of budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-y border-line">
              {rows.map((r) => {
                const pct = r.budget ? r.totalTokens / r.budget : 0
                return (
                  <tr key={r.threadId}>
                    <td className="max-w-48 truncate py-3 pr-4 font-mono text-xs">
                      {r.threadId}
                    </td>
                    <td className="py-3 pr-4 font-display text-lg font-bold">
                      {compact(r.totalTokens)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-2">
                      {compact(r.inputTokens)} / {compact(r.outputTokens)}
                    </td>
                    <td className="py-3 pr-4 text-ink-2">
                      {r.cost ? `$${r.cost.toFixed(4)}` : '$0.00 (scripted)'}
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        aria-label={`budget ${r.threadId}`}
                        value={r.budget}
                        onChange={(e) =>
                          setBudget(r.threadId, Number(e.target.value) || 0)
                        }
                        className="input w-24 py-1 text-xs"
                      />
                    </td>
                    <td className="py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1 w-20 rounded-full bg-line-strong">
                          <span
                            className={`block h-full rounded-full ${r.over ? 'bg-err' : pct > 0.8 ? 'bg-warn' : 'bg-ink'}`}
                            style={{ width: `${Math.min(pct * 100, 100)}%` }}
                          />
                        </span>
                        <span
                          className={`font-mono text-[11px] ${r.over ? 'text-err' : pct > 0.8 ? 'text-warn' : 'text-ink-2'}`}
                        >
                          {r.over ? 'over' : `${Math.round(pct * 100)}%`}
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div>
            <h2 className="label mb-2">By team</h2>
            {teamTotals.size === 0 ? (
              <p className="text-[13px] text-ink-3">No team sessions yet.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {[...teamTotals].map(([teamId, cost]) => (
                  <li key={teamId} className="flex items-center py-2.5">
                    <span>{teamNames.get(teamId) ?? teamId}</span>
                    <span className="ml-auto font-mono text-xs">
                      ${cost.toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
