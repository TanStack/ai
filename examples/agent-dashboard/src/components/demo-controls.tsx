/**
 * The demo-only controls, rendered inside a custom TanStack DevTools panel
 * (see `__root.tsx`) rather than inline in the channel — so it's obvious what
 * drives the demo vs. what an operator would actually use.
 *
 * The panel lives in the devtools render root, outside the route tree, so it
 * can't take props from the current route. It reads the active channel from the
 * `uiState` DB row (published by `ChannelView`) and re-derives the primary
 * member from the same live collections the channel view uses — one shared
 * source of truth, two independent readers.
 */
import { eq, useLiveQuery } from '@tanstack/react-db'
import {
  channelMembers,
  channels,
  memberships,
  uiState,
} from '@/db/collections'
import { addAgentToChannel, channelSendPrompt } from '@/lib/session-controller'
import { AutomationsPanel } from '@/components/automations-panel'
import { MemoryPanel } from '@/components/memory-panel'
import type {
  ChannelMemberRow,
  ChannelRow,
  MembershipRow,
  UiStateRow,
} from '@/db/collections'

/** The devtools plugin body: resolve the active channel, then render its controls. */
export function DemoControlsPanel() {
  const { data: rows = [] } = useLiveQuery((q) => q.from({ u: uiState }))
  const active = (rows as Array<UiStateRow>).find((r) => r.id === 'active')

  return (
    <div className="min-h-full space-y-3 bg-neutral-950 p-4 text-white">
      <div>
        <h2 className="text-sm font-semibold text-amber-200/90">
          Demo controls
        </h2>
        <p className="text-xs text-white/40">
          Scaffolding to drive the demo — not part of the product UX. Reads live
          app state (TanStack DB) from the devtools render root.
        </p>
      </div>
      {active?.channelId ? (
        <DemoControls channelId={active.channelId} />
      ) : (
        <p className="text-xs text-white/40">
          Open a team channel to see its demo controls.
        </p>
      )}
    </div>
  )
}

function DemoControls({ channelId }: { channelId: string }) {
  const { data: chanRows = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.id, channelId)),
    [channelId],
  )
  const channel = (chanRows as Array<ChannelRow>)[0]
  const teamId = channel?.teamId

  const { data: roster = [] } = useLiveQuery(
    (q) =>
      q.from({ m: memberships }).where(({ m }) => eq(m.teamId, teamId ?? '')),
    [teamId],
  )
  const rosterRows = roster as Array<MembershipRow>
  const { data: chanMembers = [] } = useLiveQuery(
    (q) =>
      q
        .from({ cm: channelMembers })
        .where(({ cm }) => eq(cm.channelId, channelId)),
    [channelId],
  )
  const chanMemberRows = chanMembers as Array<ChannelMemberRow>

  // Mirror ChannelView's member/primary derivation so the controls target the
  // same agent the channel does.
  const isMain = channel?.kind !== 'dynamic' && channel?.kind !== 'dm'
  const memberRows: Array<MembershipRow> = isMain
    ? rosterRows
    : chanMemberRows
        .map((cm) => rosterRows.find((m) => m.agentId === cm.agentId))
        .filter((m): m is MembershipRow => Boolean(m))
  const primary =
    memberRows.find((m) => m.role === 'agent') ?? memberRows[0] ?? undefined

  if (!channel) {
    return <p className="text-xs text-white/40">This channel isn't loaded.</p>
  }

  return (
    <div className="space-y-4">
      {isMain && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!primary}
            onClick={() =>
              primary &&
              void channelSendPrompt(
                primary,
                'Please handle ticket T-1042 for Ada.',
                channelId,
              )
            }
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05] disabled:opacity-40"
          >
            ▶ Start triage demo
          </button>
          <button
            onClick={() => addAgentToChannel(channelId, 'support/triage')}
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
          >
            + Add agent
          </button>
          <button
            onClick={() =>
              addAgentToChannel(channelId, 'dashboard/meta', 'operator')
            }
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
          >
            + Add operator
          </button>
        </div>
      )}
      {primary && isMain && (
        <AutomationsPanel channelId={channelId} primary={primary} />
      )}
      {primary && primary.role === 'agent' && (
        <MemoryPanel threadId={primary.threadId} name={primary.displayName} />
      )}
    </div>
  )
}
