import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'
import { CaretDownIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { channels, teams } from '@/db/collections'
import { addAgentToChannel, createTeam } from '@/lib/session-controller'
import { Avatar, PageHeader } from '@/components/ui'
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
    <div className="px-8 py-7">
      <PageHeader
        title="Agents"
        sub="Every agent this host can run. Add one to a team to start a chat, or spin up the seeded demos from the Demo Controls devtools panel."
      />

      <table className="w-full">
        <thead>
          <tr className="label text-left">
            <th className="pb-2 font-normal">Agent</th>
            <th className="pb-2 font-normal">Description</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">
          {agents.map((agent) => (
            <tr key={agent.name}>
              <td className="py-3 pr-6 align-top whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <Avatar name={agent.name} />
                  <span className="font-mono text-xs">{agent.name}</span>
                </span>
              </td>
              <td className="py-3 pr-6 align-top text-ink-2">
                {agent.description}
              </td>
              <td className="relative py-3 text-right align-top">
                <button
                  onClick={() =>
                    setOpenFor((cur) =>
                      cur === agent.name ? undefined : agent.name,
                    )
                  }
                  className="btn btn-sm btn-outline"
                >
                  Add to team
                  <CaretDownIcon size={12} />
                </button>
                {openFor === agent.name && (
                  <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-line bg-ui p-1 text-left shadow-2">
                    <button
                      onClick={() => addToNew(agent.name)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-ui-hover"
                    >
                      <PlusIcon size={14} className="text-ink-3" />
                      New team with this agent
                    </button>
                    {(teamRows as Array<TeamRow>).length > 0 && (
                      <div className="mt-1 border-t border-line pt-1">
                        {(teamRows as Array<TeamRow>).map((team) => (
                          <button
                            key={team.id}
                            onClick={() => addToExisting(agent.name, team)}
                            className="block w-full truncate rounded-sm px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-ui-hover hover:text-ink"
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

      <h2 className="label mt-10 mb-2">Teams</h2>
      {(teamRows as Array<TeamRow>).length === 0 ? (
        <p className="text-ink-3">
          No teams yet. Add an agent to a team above to start one.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {(teamRows as Array<TeamRow>).map((team) => (
            <li key={team.id}>
              <Link
                to="/teams/$teamId"
                params={{ teamId: team.id }}
                className="flex items-center gap-3 px-2 py-3 transition-colors duration-150 hover:bg-ui-hover"
              >
                <span>{team.name}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  {team.id}
                </span>
                <CaretRightIcon size={12} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
