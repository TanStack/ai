import { createFileRoute } from '@tanstack/react-router'

/**
 * Runtime info endpoint for CopilotKit/AG-UI compatibility.
 *
 * CopilotKit's HttpAgent client may fetch runtime information
 * about available agents and their capabilities.
 *
 * Supports both GET (for simple info queries) and POST (for detailed requests).
 */
export const Route = createFileRoute('/api/chat/info')({
  server: {
    handlers: {
      GET: async () => {
        const runtimeInfo = {
          agents: [
            {
              id: 'tanstack-ai',
              name: 'tanstack-ai',
              description: 'TanStack AI agent connected via AG-UI protocol',
              capabilities: ['chat', 'sse', 'ag-ui-protocol'],
            },
          ],
          provider: 'tanstack-ai',
          version: '1.0.0',
        }

        return new Response(JSON.stringify(runtimeInfo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },

      POST: async ({ request }) => {
        // Some AG-UI clients may POST to /info for discovery
        // Return the same runtime information
        const runtimeInfo = {
          agents: [
            {
              id: 'tanstack-ai',
              name: 'tanstack-ai',
              description: 'TanStack AI agent connected via AG-UI protocol',
              capabilities: ['chat', 'sse', 'ag-ui-protocol'],
            },
          ],
          provider: 'tanstack-ai',
          version: '1.0.0',
        }

        return new Response(JSON.stringify(runtimeInfo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
