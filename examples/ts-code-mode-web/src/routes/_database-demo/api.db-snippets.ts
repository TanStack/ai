import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { createAlwaysTrustedStrategy } from '@tanstack/ai-code-mode-snippets'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const snippetsDir = resolve(__dirname, '../../../.db-snippets')

const trustStrategy = createAlwaysTrustedStrategy()

const snippetStorage = createFileSnippetStorage({
  directory: snippetsDir,
  trustStrategy,
})

export const Route = createFileRoute('/_database-demo/api/db-snippets' as any)({
  server: {
    handlers: {
      GET: async () => {
        try {
          const snippetIndex = await snippetStorage.loadIndex()

          const snippetsWithStats = await Promise.all(
            snippetIndex.map(async (snippet) => {
              const full = await snippetStorage.get(snippet.name)
              return {
                id: snippet.id,
                name: snippet.name,
                description: snippet.description,
                usageHints: snippet.usageHints,
                trustLevel: snippet.trustLevel,
                code: full?.code ?? '',
                stats: full?.stats ?? { executions: 0, successRate: 0 },
              }
            }),
          )

          return new Response(JSON.stringify(snippetsWithStats), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('[API DB Snippets] Error loading snippets:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to load snippets' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const deleteAll = url.searchParams.get('all') === 'true'

          if (deleteAll) {
            const snippetIndex = await snippetStorage.loadIndex()
            await Promise.all(
              snippetIndex.map((snippet) =>
                snippetStorage.delete(snippet.name),
              ),
            )
            return new Response(
              JSON.stringify({ success: true, deleted: snippetIndex.length }),
              {
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const name = url.searchParams.get('name')

          if (!name) {
            return new Response(
              JSON.stringify({ error: 'Missing snippet name' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const deleted = await snippetStorage.delete(name)

          if (!deleted) {
            return new Response(
              JSON.stringify({ error: `Snippet '${name}' not found` }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          return new Response(
            JSON.stringify({ success: true, deleted: name }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error('[API DB Snippets] Error deleting snippet:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to delete snippet' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
