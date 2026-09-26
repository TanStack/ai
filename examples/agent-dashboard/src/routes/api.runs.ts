import { createFileRoute } from '@tanstack/react-router'
import { HARNESS_PROTOCOL_VERSION } from '@tanstack/ai-harness'
import { getHost, getPersistence, listThreads, triage } from '@/server/harness'

// Run history, backed by HarnessPersistence (runs.listByThread), across every
// thread this host has touched. Newest first.
export const Route = createFileRoute('/api/runs')({
  server: {
    handlers: {
      GET: async () => {
        const host = getHost()
        // Ensure each thread's session is open so its runs are in persistence.
        const perThread = await Promise.all(
          listThreads().map(async (thread) => {
            await host.open(triage, { threadId: thread.id })
            const runs =
              (await getPersistence().stores.runs?.listByThread?.(
                thread.id,
              )) ?? []
            return runs.map((run) => ({
              runId: run.runId,
              threadId: run.threadId,
              status: run.status,
              kind: run.kind ?? 'chat',
              agent: run.agent ?? null,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt ?? null,
            }))
          }),
        )
        const runs = perThread
          .flat()
          .sort((a, b) => b.startedAt - a.startedAt)
        return Response.json({ protocolVersion: HARNESS_PROTOCOL_VERSION, runs })
      },
    },
  },
})
