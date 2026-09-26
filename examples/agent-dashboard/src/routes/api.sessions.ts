import { createFileRoute } from '@tanstack/react-router'
import { getHost, listThreads, triage } from '@/server/harness'

// List the threads this host has touched, with a live status from each session
// snapshot (running / requires_action / idle).
export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async () => {
        const host = getHost()
        const sessions = await Promise.all(
          listThreads().map(async (thread) => {
            const session = await host.open(triage, { threadId: thread.id })
            const snapshot = session.snapshot()
            return {
              ...thread,
              status: snapshot.status,
              pendingInterrupts: snapshot.pendingInterrupts.length,
              pendingQuestions: snapshot.pendingQuestions.length,
            }
          }),
        )
        return Response.json(sessions)
      },
    },
  },
})
