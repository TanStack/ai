import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { channels } from '@/db/collections'
import { ChannelView } from '@/components/channel-view'
import type { ChannelRow } from '@/db/collections'

export const Route = createFileRoute('/teams/$teamId')({
  component: TeamView,
})

function TeamView() {
  const { teamId } = Route.useParams()
  const { data: chans = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.teamId, teamId)),
    [teamId],
  )
  const main =
    (chans as Array<ChannelRow>).find((c) => c.kind === 'main') ??
    (chans as Array<ChannelRow>)[0]

  if (!main) {
    return (
      <div className="space-y-2">
        <a href="/" className="text-xs text-white/40 hover:text-white/70">
          ← teams
        </a>
        <p className="text-sm text-white/50">
          This team isn't loaded in this tab. Team state is in-memory for the POC —
          create a team from the home page to start one.
        </p>
      </div>
    )
  }

  return <ChannelView channelId={main.id} />
}
