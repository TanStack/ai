import type { MembershipRow, SessionRow } from '@/db/collections'

const dot: Record<string, string> = {
  running: 'bg-sky-400',
  requires_action: 'bg-amber-400',
  idle: 'bg-white/30',
}

function subscribed(member: MembershipRow): boolean {
  return (member.subscriptions ?? []).some((s) => s.event === 'channel_created')
}

/** The team roster. Renders only when a channel has more than one member. */
export function MemberList({
  members,
  statusByThread,
  onRun,
  onCreateDm,
  onToggleSubscription,
}: {
  members: Array<MembershipRow>
  statusByThread: Record<string, SessionRow['status']>
  onRun: (member: MembershipRow) => void
  onCreateDm?: (member: MembershipRow) => void
  onToggleSubscription?: (member: MembershipRow) => void
}) {
  return (
    <aside className="w-56 shrink-0 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">
        Members · {members.length}
      </h2>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${dot[statusByThread[m.threadId] ?? 'idle']}`}
              />
              <span className="truncate">{m.displayName}</span>
              {m.role === 'operator' ? (
                <span className="ml-auto rounded bg-fuchsia-500/20 px-1 text-[10px] text-fuchsia-300">
                  operator
                </span>
              ) : (
                <button
                  onClick={() => onRun(m)}
                  aria-label={`Run ${m.displayName}`}
                  className="ml-auto rounded border border-white/15 px-1.5 text-[11px] text-white/60 hover:bg-white/[0.06]"
                >
                  ▶ run
                </button>
              )}
            </div>
            {m.role === 'agent' && (
              <div className="flex items-center gap-1 pl-4">
                {onToggleSubscription && (
                  <button
                    onClick={() => onToggleSubscription(m)}
                    aria-label={`Toggle subscription for ${m.displayName}`}
                    className={`rounded border px-1.5 text-[10px] ${
                      subscribed(m)
                        ? 'border-emerald-500/40 text-emerald-300'
                        : 'border-white/15 text-white/40'
                    }`}
                  >
                    {subscribed(m) ? '🔔 subscribed' : '🔕 subscribe'}
                  </button>
                )}
                {onCreateDm && (
                  <button
                    onClick={() => onCreateDm(m)}
                    aria-label={`New DM with ${m.displayName}`}
                    className="rounded border border-white/15 px-1.5 text-[10px] text-white/50 hover:bg-white/[0.06]"
                  >
                    New DM
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
