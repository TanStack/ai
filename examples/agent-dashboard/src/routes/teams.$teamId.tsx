import { createFileRoute } from '@tanstack/react-router'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'
import { channels } from '@/db/collections'
import { ChannelView } from '@/components/channel-view'
import type { ChannelRow } from '@/db/collections'

export const Route = createFileRoute('/teams/$teamId')({
  component: TeamView,
})

const kindOrder: Record<ChannelRow['kind'], number> = {
  main: 0,
  dynamic: 1,
  dm: 2,
}

function TeamView() {
  const { teamId } = Route.useParams()
  const { data: chans = [] } = useLiveQuery(
    (q) => q.from({ c: channels }).where(({ c }) => eq(c.teamId, teamId)),
    [teamId],
  )
  const channelRows = [...(chans as Array<ChannelRow>)].sort(
    (a, b) =>
      (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) ||
      a.createdAt - b.createdAt,
  )
  const main =
    channelRows.find((c) => c.kind === 'main') ?? channelRows[0] ?? undefined

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const activeId = selected ?? main?.id
  // If the selected channel disappears (fresh tab), fall back to main.
  useEffect(() => {
    if (selected && !channelRows.some((c) => c.id === selected)) {
      setSelected(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelRows.map((c) => c.id).join(',')])

  if (!main || !activeId) {
    return (
      <div className="space-y-2">
        <a href="/" className="text-xs text-white/40 hover:text-white/70">
          ← teams
        </a>
        <p className="text-sm text-white/50">
          Loading this team… If it stays empty, it doesn't exist yet — create one
          from the home page to start.
        </p>
      </div>
    )
  }

  const hasChannelChrome = channelRows.length > 1

  return (
    <div className="flex gap-4">
      {hasChannelChrome && (
        <aside className="w-44 shrink-0 space-y-1 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Channels
          </h2>
          <ul className="space-y-1">
            {channelRows.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className={`w-full truncate rounded px-2 py-1 text-left text-sm ${
                    c.id === activeId
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/60 hover:bg-white/[0.04]'
                  }`}
                  title={c.topic ?? c.name}
                >
                  <span className="text-white/40">
                    {c.kind === 'dm' ? '@ ' : '# '}
                  </span>
                  {c.kind === 'main' ? 'main' : c.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="min-w-0 flex-1">
        <ChannelView channelId={activeId} teamId={teamId} />
      </div>
    </div>
  )
}
