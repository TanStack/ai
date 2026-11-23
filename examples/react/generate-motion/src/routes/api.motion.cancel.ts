import { createFileRoute } from '@tanstack/react-router'
import { cancel3dMotionJob } from '@tanstack/ai'
import { fal3dMotion } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

function hasJobId(body: unknown): body is { jobId: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'jobId' in body &&
    typeof body.jobId === 'string'
  )
}

export async function POST({ request }: { request: Request }) {
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)
  const body: unknown = await request.json()
  if (!hasJobId(body)) {
    return Response.json({ error: 'Send { jobId } as JSON.' }, { status: 400 })
  }

  // Ask fal to stop the job. This is a remote cancel. The hook's stop()
  // only closes the stream in this tab.
  try {
    await cancel3dMotionJob({
      adapter: fal3dMotion('fal-ai/hunyuan-motion', { apiKey }),
      jobId: body.jobId,
    })
    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed'
    return Response.json({ error: message }, { status: 502 })
  }
}

export const Route = createFileRoute('/api/motion/cancel')({
  server: {
    handlers: {
      POST,
    },
  },
})
