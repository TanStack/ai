import { createFileRoute } from '@tanstack/react-router'
import { listThreads, openThread } from '@/server/harness'
import '@/server/meta'

// The threads of the session index, with a live status from each session
// snapshot (running / requires_action / idle).
export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async () => {
        const sessions = await Promise.all(
          (await listThreads()).map(async (thread) => {
            const { session } = await openThread(thread.id, thread.harness)
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
