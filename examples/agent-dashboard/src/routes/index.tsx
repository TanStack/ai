import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from '@tanstack/react-db'
import { teams } from '@/db/collections'
import { createPrWatcherTeam, createTeam } from '@/lib/session-controller'
import type { TeamRow } from '@/db/collections'

export const Route = createFileRoute('/')({
  component: Home,
})

interface Host {
  id: string
  name: string
  agents: Array<{ name: string; description: string }>
  sessions: number
}

function Home() {
  const navigate = useNavigate()
  const hosts = useQuery<Array<Host>>({
    queryKey: ['hosts'],
    queryFn: () => fetch('/api/hosts').then((r) => r.json()),
  })
  const { data: teamRows = [] } = useLiveQuery((q) => q.from({ t: teams }))

  const newTeam = () => {
    const { teamId } = createTeam('Support triage', 'support/triage')
    navigate({ to: '/teams/$teamId', params: { teamId } })
  }

  const newPrWatcherTeam = () => {
    const { teamId } = createPrWatcherTeam()
    navigate({ to: '/teams/$teamId', params: { teamId } })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Hosts</h1>
          <div className="flex gap-2">
            <button
              onClick={newPrWatcherTeam}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.05]"
            >
              + PR-watcher demo
            </button>
            <button
              onClick={newTeam}
              className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400"
            >
              + New team
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(hosts.data ?? []).map((host) => (
            <div
              key={host.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-medium">{host.name}</span>
                <span className="ml-auto text-xs text-white/40">
                  {host.agents.length} agent
                  {host.agents.length === 1 ? '' : 's'} available
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {host.agents.map((agent) => (
                  <li key={agent.name} className="text-sm">
                    <span className="font-mono text-xs text-sky-300">
                      {agent.name}
                    </span>
                    <span className="ml-2 text-white/60">
                      {agent.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/70">Teams</h2>
        <p className="text-xs text-white/40">
          A team starts as one agent in a chat. Add a second member from inside the
          team and the roster appears — same primitives, more members.
        </p>
        {(teamRows as Array<TeamRow>).length === 0 ? (
          <p className="text-sm text-white/40">
            No teams yet. Start one to watch it live.
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
