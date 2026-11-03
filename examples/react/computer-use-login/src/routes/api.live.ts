import { createFileRoute } from '@tanstack/react-router'
import { liveViewUrl } from '@/harness'

// The address of the live view of a thread's desktop. It holds the VNC
// password, so only this machine can reach it (see `publishPorts`).
export const Route = createFileRoute('/api/live')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId')
        if (!threadId) {
          return Response.json({ error: 'Send a thread id.' }, { status: 400 })
        }
        return Response.json({ url: await liveViewUrl(threadId) })
      },
    },
  },
})
