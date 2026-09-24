import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  defineAgent,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import {
  deleteLogs,
  isSubagentScenario,
  lookupFacts,
} from '@/lib/subagents-test'
import type { SubagentScenario } from '@/lib/subagents-test'

/**
 * Subagent harness. Every child is a real `chat()` on the OpenAI adapter
 * against aimock, so the child's reasoning, tool calls, and approval go
 * through the same path as an app.
 *
 * - `route`: a router picks `researcher`. The child thinks, calls a server
 *   tool, then answers.
 * - `approval`: a router picks `cleaner`. The child's tool needs approval,
 *   so the parent run ends with the child's interrupt. The resume continues
 *   the same child.
 * - `tool`: no router. The parent model calls the `researcher` tool, the
 *   child answers, and the parent reads its result.
 */
function subagentsFor(
  scenario: SubagentScenario,
  aimockPort: number | undefined,
  testId: string | undefined,
) {
  const child = (
    name: string,
    tools: Array<Tool>,
    model?: string,
    modelOptions?: Record<string, unknown>,
  ) =>
    defineAgent({
      name,
      description: `${name} agent`,
      run: (ctx) =>
        chat({
          ...createTextAdapter('openai', model, aimockPort, testId),
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
          parentRunId: ctx.parentRunId,
          subagentRunId: ctx.subagentRunId,
          resume: ctx.resume,
          tools,
          ...(modelOptions ? { modelOptions } : {}),
          agentLoopStrategy: maxIterations(4),
        }),
    })

  if (scenario === 'route') {
    const researcher = child(
      'researcher',
      [lookupFacts.server(({ topic }) => ({ topic, facts: ['three hearts'] }))],
      'o3',
      { reasoning: { effort: 'high' } },
    )
    return { agents: [researcher], router: () => 'researcher' }
  }
  if (scenario === 'approval') {
    const cleaner = child('cleaner', [
      deleteLogs.server(({ folder }) => ({ deleted: folder })),
    ])
    return { agents: [cleaner], router: () => 'cleaner' }
  }
  return { agents: [child('researcher', [])] }
}

export const Route = createFileRoute('/api/subagents-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal?.aborted) return new Response(null, { status: 499 })
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps
        const scenario = isSubagentScenario(fp.scenario) ? fp.scenario : 'route'
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined
        const abortController = new AbortController()

        try {
          const stream = chat({
            ...createTextAdapter('openai', undefined, aimockPort, testId),
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.resume ? { resume: params.resume } : {}),
            subagents: subagentsFor(scenario, aimockPort, testId),
            agentLoopStrategy: maxIterations(4),
            abortController,
          })
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
