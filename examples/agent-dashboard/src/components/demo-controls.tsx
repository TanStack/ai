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
import { useNavigate } from '@tanstack/react-router'
import {
  channelMembers,
  channels,
  memberships,
  uiState,
} from '@/db/collections'
import {
  channelSendPrompt,
  createPrWatcherTeam,
  createReactNewsTeam,
  createTeam,
} from '@/lib/session-controller'
import { AutomationsPanel } from '@/components/automations-panel'
import type {
  ChannelMemberRow,
  ChannelRow,
  MembershipRow,
  UiStateRow,
} from '@/db/collections'

/** The devtools plugin body: seeded-demo launchers, then the active channel's controls. */
export function DemoControlsPanel() {
  const navigate = useNavigate()
  const { data: rows = [] } = useLiveQuery((q) => q.from({ u: uiState }))
  const active = (rows as Array<UiStateRow>).find((r) => r.id === 'active')

  const go = (teamId: string) =>
    navigate({ to: '/teams/$teamId', params: { teamId } })

  return (
    <div className="min-h-full space-y-4 bg-surface p-4 font-sans text-ink">
      <div>
        <h2 className="font-display text-[17px] font-bold">Demo controls</h2>
        <p className="text-xs text-ink-3">
          Scaffolding to drive the demo — not part of the product UX. Reads live
          app state (TanStack DB) from the devtools render root.
        </p>
      </div>

      <div className="space-y-2">
        <div className="label">Seeded demos</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              go(createTeam('Support triage', 'support/triage').teamId)
            }
            className="btn btn-outline"
          >
            + New team
          </button>
          <button
            onClick={() => go(createReactNewsTeam().teamId)}
            className="btn btn-outline"
          >
            + React-news demo
          </button>
          <button
            onClick={() => go(createPrWatcherTeam().teamId)}
            className="btn btn-outline"
          >
            + PR-watcher demo
          </button>
        </div>
      </div>

      {active?.channelId ? (
        <DemoControls channelId={active.channelId} />
      ) : (
        <p className="text-xs text-ink-3">
          Open a team channel to see its per-channel demo controls.
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
    return <p className="text-xs text-ink-3">This channel isn't loaded.</p>
  }

  return (
    <div className="space-y-4 border-t border-line pt-3">
      {isMain && primary?.harness === 'support/triage' && (
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
          className="btn btn-outline"
        >
          ▶ Start triage demo
        </button>
      )}
      {primary && isMain && (
        <AutomationsPanel channelId={channelId} primary={primary} />
      )}
    </div>
  )
}
