import { createFileRoute } from '@tanstack/react-router'
import { canAccess, noteThread } from '@/server/harness'
import { runPrompt } from '@/server/injection'
import '@/server/meta'

// The memory-attaching run trigger: start a model run for a thread and prepend the
// thread's current pod memory as a `systemPreamble`. Used by interactive channel
// prompts and by subscription dispatch — the platform attaches the memory, the
// agent author does nothing. Observation is via the live tail, so this only
// triggers (no stream in the response).
export const Route = createFileRoute('/api/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          threadId?: string
          message?: string
          harness?: string
        }
        if (!body.threadId || typeof body.message !== 'string') {
          return Response.json(
            { error: 'threadId and message required' },
            { status: 400 },
          )
        }
        canAccess({ id: 'local' }, body.threadId)
        if (body.harness) noteThread(body.threadId, body.harness)
        const { attached } = await runPrompt({
          threadId: body.threadId,
          message: body.message,
        })
        return Response.json({ ok: true, attached })
      },
    },
  },
})
