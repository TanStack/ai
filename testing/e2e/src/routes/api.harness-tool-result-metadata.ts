import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createSessionView } from '@tanstack/ai-harness/view'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { SessionView, ToolCallPart } from '@tanstack/ai-harness/view'
import { createTextAdapter } from '@/lib/providers'

/**
 * Tool result metadata in a harness session view. It uses the aimock
 * fixtures of `tool-result-metadata.spec.ts` (`fixtures/tool-result-metadata/`).
 *
 * The `search_docs` server tool sets `sources` with `setResultMetadata`. The
 * route reads the tool call part of `createSessionView` twice: live, then in
 * a new view of the reopened thread, which reads the saved transcript.
 */

const searchDocs = toolDefinition({
  name: 'search_docs',
  description: 'Search the docs',
  inputSchema: z.object({ query: z.string() }),
}).server(async (_args, context) => {
  context?.setResultMetadata?.({
    sources: [{ id: 'src-lighthouse', title: 'Lighthouse guide' }],
  })
  return { answer: 'LIGHTHOUSE_ANSWER the lamp turns every ten seconds.' }
})

/** The tool call parts that the view shows. */
const toolCalls = (view: SessionView) =>
  view.store
    .get()
    .messages.flatMap((message) =>
      message.role === 'assistant' ? message.parts : [],
    )
    .filter((part): part is ToolCallPart => part.type === 'tool-call')

/** The view reads events on its own, so wait until the call has its result. */
async function settledCalls(view: SessionView) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const calls = toolCalls(view)
    if (calls.length > 0 && calls.every((call) => call.status !== 'running')) {
      return calls.map(({ name, status, resultMetadata }) => ({
        name,
        status,
        resultMetadata: resultMetadata ?? null,
      }))
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('The view shows no finished tool call.')
}

export const Route = createFileRoute('/api/harness-tool-result-metadata')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId')
        const harness = defineHarness({
          name: 'e2e/harness-tool-result-metadata',
          adapter: createTextAdapter(
            'openai',
            undefined,
            undefined,
            testId ?? undefined,
          ).adapter,
          tools: [searchDocs],
        })
        const threadId = 'e2e-harness-tool-result-metadata'
        const host = createHarnessHost({ persistence: memoryPersistence() })
        try {
          const session = await host.open(harness, { threadId })
          const view = createSessionView(session)
          await view.ready
          await session.send('[tool-result-metadata] find the lighthouse docs')
          const live = await settledCalls(view)
          view.dispose()
          await session.close()

          const reopened = await host.open(harness, { threadId })
          const reloadedView = createSessionView(reopened)
          await reloadedView.ready
          const reloaded = await settledCalls(reloadedView)
          reloadedView.dispose()
          return Response.json({ live, reloaded })
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          await host.close()
        }
      },
    },
  },
})
