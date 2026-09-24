import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createMCPClient, MCPTaskRequiredToolError } from '@tanstack/ai-mcp'
import { z } from 'zod'

const SCENARIOS = [
  'abort',
  'skip-unsupported',
  'call-unsupported',
  'bind-unsupported',
] as const

type Scenario = (typeof SCENARIOS)[number]

function isScenario(value: string | null): value is Scenario {
  return value !== null && (SCENARIOS as ReadonlyArray<string>).includes(value)
}

const needsTasksDef = toolDefinition({
  name: 'needs_tasks',
  description: 'Requires tasks the server cannot execute',
  inputSchema: z.object({}),
})

/**
 * Unhappy-path MCP task probes. No LLM. Query `?scenario=` selects one case:
 * abort a hanging task, skip a task-required tool without capability,
 * callTool/bind that same tool and get MCPTaskRequiredToolError.
 */
export const Route = createFileRoute('/api/mcp-task-errors')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const scenario = url.searchParams.get('scenario')
        if (!isScenario(scenario)) {
          return Response.json({ error: 'Unknown scenario' }, { status: 400 })
        }
        const origin = url.origin
        if (scenario === 'abort') {
          return runAbort(origin)
        }
        return runUnsupported(origin, scenario)
      },
    },
  },
})

async function runAbort(origin: string) {
  const client = await createMCPClient({
    transport: { type: 'http', url: `${origin}/api/mcp-server` },
  })
  const started = Date.now()
  try {
    const outcome = await Promise.race([
      client
        .callTool(
          'hanging_appraisal',
          { ids: ['strat'] },
          { signal: AbortSignal.timeout(100) },
        )
        .then((result) => ({ kind: 'result' as const, result }))
        .catch((error: unknown) => ({
          kind: 'error' as const,
          errorName: error instanceof Error ? error.name : 'unknown',
          message: error instanceof Error ? error.message : String(error),
        })),
      new Promise<{ kind: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'timeout' }), 3000),
      ),
    ])
    if (outcome.kind === 'result') {
      return Response.json({
        aborted: false,
        elapsedMs: Date.now() - started,
        errorName: 'none',
        message: JSON.stringify(outcome.result),
      })
    }
    if (outcome.kind === 'timeout') {
      return Response.json({
        aborted: false,
        elapsedMs: Date.now() - started,
        errorName: 'timeout',
        message: 'callTool did not abort within 3000ms',
      })
    }
    return Response.json({
      aborted: outcome.errorName !== 'none',
      elapsedMs: Date.now() - started,
      errorName: outcome.errorName,
      message: outcome.message,
    })
  } finally {
    void client.close().catch(() => {})
  }
}

async function runUnsupported(
  origin: string,
  scenario: Exclude<Scenario, 'abort'>,
) {
  const client = await createMCPClient({
    transport: { type: 'http', url: `${origin}/api/mcp-no-tasks-server` },
  })
  try {
    if (scenario === 'skip-unsupported') {
      const tools = await client.tools()
      return Response.json({ tools: tools.map((tool) => tool.name) })
    }
    if (scenario === 'call-unsupported') {
      try {
        await client.callTool('needs_tasks')
        return Response.json({ errorName: 'none' })
      } catch (error) {
        return Response.json({
          errorName: error instanceof Error ? error.name : 'unknown',
          isTaskRequired: error instanceof MCPTaskRequiredToolError,
        })
      }
    }
    try {
      await client.tools([needsTasksDef])
      return Response.json({ errorName: 'none' })
    } catch (error) {
      return Response.json({
        errorName: error instanceof Error ? error.name : 'unknown',
        isTaskRequired: error instanceof MCPTaskRequiredToolError,
      })
    }
  } finally {
    await client.close()
  }
}
