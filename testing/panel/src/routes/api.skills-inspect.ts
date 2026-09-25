import { createFileRoute } from '@tanstack/react-router'
import { activatedFor, skillsSource } from '@/lib/skills-store'

/**
 * Read-only inspector for the `/skills` demo. Returns the catalog the model
 * sees (every skill's name + description) plus the skills loaded so far on this
 * thread, so the page can badge which ones are active.
 */
export const Route = createFileRoute('/api/skills-inspect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const threadId = url.searchParams.get('threadId') ?? ''
        const catalog = await skillsSource.list()
        return new Response(
          JSON.stringify({
            catalog: catalog.map((s) => ({
              name: s.name,
              description: s.description,
            })),
            activated: activatedFor(threadId),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
