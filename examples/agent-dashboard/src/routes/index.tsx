import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/')({
  component: Home,
})

interface Host {
  id: string
  name: string
  harness: string
  description: string
  sessions: number
}

interface SessionSummary {
  id: string
  status: 'idle' | 'running' | 'requires_action'
  pendingInterrupts: number
  lastActivity: number
}

const statusStyle: Record<string, string> = {
  idle: 'bg-white/10 text-white/60',
  running: 'bg-sky-500/20 text-sky-300',
  requires_action: 'bg-amber-500/20 text-amber-300',
}

function Home() {
  const navigate = useNavigate()
  const hosts = useQuery<Array<Host>>({
    queryKey: ['hosts'],
    queryFn: () => fetch('/api/hosts').then((r) => r.json()),
  })
  const sessions = useQuery<Array<SessionSummary>>({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then((r) => r.json()),
    refetchInterval: 2000,
  })

  const newSession = () => {
    const id = `triage-${Math.random().toString(36).slice(2, 8)}`
    navigate({ to: '/sessions/$threadId', params: { threadId: id } })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Hosts</h1>
          <button
            onClick={newSession}
            className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400"
          >
            + New triage session
          </button>
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
                  {host.sessions} session{host.sessions === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/50">{host.harness}</p>
              <p className="mt-2 text-sm text-white/70">{host.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/70">Sessions</h2>
        {(sessions.data ?? []).length === 0 ? (
          <p className="text-sm text-white/40">
            No sessions yet. Start one to watch it live.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10">
            {(sessions.data ?? []).map((session) => (
              <li key={session.id}>
                <a
                  href={`/sessions/${session.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
                >
                  <span className="font-mono text-sm">{session.id}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs ${statusStyle[session.status] ?? ''}`}
                  >
                    {session.status.replace('_', ' ')}
                  </span>
                  {session.pendingInterrupts > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                      {session.pendingInterrupts} awaiting approval
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
