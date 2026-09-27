import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'
import { channels, teams } from '@/db/collections'
import { addAgentToChannel, createTeam } from '@/lib/session-controller'
import type { ChannelRow, TeamRow } from '@/db/collections'

export const Route = createFileRoute('/')({
  component: Home,
})

interface Host {
  id: string
  name: string
  agents: Array<{ name: string; description: string }>
  sessions: number
}

const shortName = (harness: string) => harness.split('/').pop() ?? harness

function Home() {
  const navigate = useNavigate()
  const hosts = useQuery<Array<Host>>({
    queryKey: ['hosts'],
    queryFn: () => fetch('/api/hosts').then((r) => r.json()),
  })
  const { data: teamRows = [] } = useLiveQuery((q) => q.from({ t: teams }))
  const { data: channelRows = [] } = useLiveQuery((q) =>
    q.from({ c: channels }),
  )

  // The team whose "Add to team" menu is open, keyed by agent name.
  const [openFor, setOpenFor] = useState<string | undefined>()

  const agents = (hosts.data ?? []).flatMap((h) => h.agents)

  const mainChannelId = (teamId: string) =>
    (channelRows as Array<ChannelRow>).find(
      (c) => c.teamId === teamId && c.kind === 'main',
    )?.id

  const addToExisting = (agent: string, team: TeamRow) => {
    const channelId = mainChannelId(team.id)
    if (channelId) addAgentToChannel(channelId, agent)
    setOpenFor(undefined)
    navigate({ to: '/teams/$teamId', params: { teamId: team.id } })
  }

  const addToNew = (agent: string) => {
    const { teamId } = createTeam(shortName(agent), agent)
    setOpenFor(undefined)
    navigate({ to: '/teams/$teamId', params: { teamId } })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="text-xs text-white/40">
          Every agent this host can run. Add one to a team to start a chat — or
          spin up the seeded demos from the Demo Controls devtools panel.
        </p>
        <div className="overflow-visible rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr
                  key={agent.name}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs text-sky-300">
                    {agent.name}
                  </td>
                  <td className="px-4 py-2 align-top text-white/60">
                    {agent.description}
                  </td>
                  <td className="relative px-4 py-2 text-right align-top">
                    <button
                      onClick={() =>
                        setOpenFor((cur) =>
                          cur === agent.name ? undefined : agent.name,
                        )
                      }
                      className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05]"
                    >
                      Add to team ▾
                    </button>
                    {openFor === agent.name && (
                      <div className="absolute right-4 z-10 mt-1 w-48 space-y-0.5 rounded-md border border-white/15 bg-neutral-900 p-1 text-left shadow-lg">
                        <button
                          onClick={() => addToNew(agent.name)}
                          className="block w-full rounded px-2 py-1 text-left text-xs text-emerald-300 hover:bg-white/[0.06]"
                        >
                          ＋ New team with this agent
                        </button>
                        {(teamRows as Array<TeamRow>).length > 0 && (
                          <div className="border-t border-white/10 pt-0.5">
                            {(teamRows as Array<TeamRow>).map((team) => (
                              <button
                                key={team.id}
                                onClick={() => addToExisting(agent.name, team)}
                                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-white/70 hover:bg-white/[0.06]"
                              >
                                Add to {team.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/70">Teams</h2>
        {(teamRows as Array<TeamRow>).length === 0 ? (
          <p className="text-sm text-white/40">
            No teams yet. Add an agent to a team above to start one.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
            {(teamRows as Array<TeamRow>).map((team) => (
              <li key={team.id}>
                <a
                  href={`/teams/${team.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
                >
                  <span className="text-sm">{team.name}</span>
                  <span className="ml-auto font-mono text-xs text-white/40">
                    {team.id}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
