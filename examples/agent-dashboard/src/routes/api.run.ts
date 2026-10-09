import { createFileRoute } from '@tanstack/react-router'
import { openThread } from '@/server/harness'
import { runPrompt } from '@/server/injection'
import '@/server/meta'

// The memory-attaching run trigger: start a model run for a thread and prepend the
// thread's current pod memory as a `systemPreamble`. A thread at its token
// budget is refused (409). Used by interactive channel
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
        await openThread(body.threadId, body.harness)
        const { attached, rejected } = await runPrompt({
          threadId: body.threadId,
          message: body.message,
        })
        if (rejected) {
          return Response.json({ ok: false, reason: rejected }, { status: 409 })
        }
        return Response.json({ ok: true, attached })
      },
    },
  },
})
