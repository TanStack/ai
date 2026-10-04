import { useState } from 'react'
import {
  BellIcon,
  BellSlashIcon,
  ChatCircleIcon,
  PlayIcon,
  WrenchIcon,
} from '@phosphor-icons/react'
import { RunToolDialog } from '@/components/run-tool-dialog'
import { Avatar } from '@/components/ui'
import { defaultSubscriptions } from '@/lib/session-controller'
import type { MembershipRow, SessionRow } from '@/db/collections'

const STATUS: Record<SessionRow['status'], { dot: string; label: string }> = {
  running: { dot: 'bg-ok', label: 'Running' },
  requires_action: { dot: 'bg-warn', label: 'Waiting for approval' },
  idle: { dot: 'bg-ink-3', label: 'Idle' },
}

function subscribed(member: MembershipRow): boolean {
  return (member.subscriptions ?? []).length > 0
}

/** Only agents that actually react to events (have default triggers) can subscribe. */
function reactive(member: MembershipRow): boolean {
  return Boolean(defaultSubscriptions(member.harness))
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
  // The member whose run-tool dialog is open (product control, not the demo run-now).
  const [toolMember, setToolMember] = useState<MembershipRow | undefined>()

  return (
    <section className="space-y-3">
      <h2 className="label">Members · {members.length}</h2>
      <ul className="space-y-3">
        {members.map((m) => {
          const operator = m.role === 'operator'
          const status = STATUS[statusByThread[m.threadId] ?? 'idle']
          return (
            <li key={m.id} className="group flex items-center gap-2.5">
              <span className="relative">
                <Avatar name={m.displayName} human={operator} />
                <span
                  className={`absolute -right-0.5 -bottom-0.5 size-[9px] rounded-full ring-2 ring-surface ${operator ? 'bg-ok' : status.dot}`}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-normal">
                  {m.displayName}
                </div>
                <div className="truncate text-xs font-normal text-ink-3">
                  {operator
                    ? 'Operator'
                    : subscribed(m)
                      ? `${status.label} · subscribed`
                      : status.label}
                </div>
              </div>
              {!operator && (
                <div className="flex shrink-0">
                  <button
                    onClick={() => onRun(m)}
                    aria-label={`Run ${m.displayName}`}
                    title="Run"
                    className="icon-btn"
                  >
                    <PlayIcon size={14} />
                  </button>
                  <button
                    onClick={() => setToolMember(m)}
                    aria-label={`Run a tool on ${m.displayName}`}
                    title="Run a tool"
                    className="icon-btn"
                  >
                    <WrenchIcon size={14} />
                  </button>
                  {onToggleSubscription && reactive(m) && (
                    <button
                      onClick={() => onToggleSubscription(m)}
                      aria-label={`Toggle subscription for ${m.displayName}`}
                      title={subscribed(m) ? 'Unsubscribe' : 'Subscribe'}
                      className="icon-btn"
                    >
                      {subscribed(m) ? (
                        <BellIcon size={14} className="text-ink" />
                      ) : (
                        <BellSlashIcon size={14} />
                      )}
                    </button>
                  )}
                  {onCreateDm && (
                    <button
                      onClick={() => onCreateDm(m)}
                      aria-label={`New DM with ${m.displayName}`}
                      title="New DM"
                      className="icon-btn"
                    >
                      <ChatCircleIcon size={14} />
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {toolMember && (
        <RunToolDialog
          member={toolMember}
          onClose={() => setToolMember(undefined)}
        />
      )}
    </section>
  )
}
