import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { channels } from '@/db/collections'
import { ChannelView } from '@/components/channel-view'
import type { ChannelRow } from '@/db/collections'

export const Route = createFileRoute('/teams/$teamId')({
  // The active channel lives in the URL so the left rail (in the root shell)
  // and this page agree on it.
  validateSearch: (search: Record<string, unknown>): { channel?: string } =>
    typeof search.channel === 'string' ? { channel: search.channel } : {},
  component: TeamView,
})

function TeamView() {
  const { teamId } = Route.useParams()
  const { channel: selected } = Route.useSearch()
  const { data: chans = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.teamId, teamId)),
    [teamId],
  )
  const rows = chans as Array<ChannelRow>
  // If the selected channel is gone (fresh tab), fall back to main.
  const activeId =
    rows.find((c) => c.id === selected)?.id ??
    (rows.find((c) => c.kind === 'main') ?? rows[0])?.id

  if (!activeId) {
    return (
      <p className="px-8 py-7 text-ink-3">
        Loading this team… If it stays empty, it doesn't exist yet. Create one
        from the Agents page to start.
      </p>
    )
  }

  return <ChannelView channelId={activeId} teamId={teamId} />
}
