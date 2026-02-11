import { createFileRoute } from '@tanstack/react-router'

/**
 * Runtime info endpoint for CopilotKit compatibility.
 *
 * CopilotKit's client fetches /info from the runtime URL to discover
 * available agents. This endpoint returns the TanStack AI agent info.
 */
export const Route = createFileRoute('/api/chat/info')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            agents: [
              {
                name: 'tanstack-ai',
                description:
                  'TanStack AI agent connected via AG-UI protocol',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
