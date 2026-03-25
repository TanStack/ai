import { z } from 'zod'
import {
  chat,
  maxIterations,
  toServerSentEventsStream,
  toolDefinition,
} from '@tanstack/ai'
import {
  executePrompt,
  InMemoryAgentStore,
} from '@tanstack/ai-code-mode'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { ExecutePromptEvent } from '@tanstack/ai-code-mode'
import type { IsolateDriver } from '@tanstack/ai-code-mode'
import { dashboardTools } from './tools'
import { INITIAL_MANIFEST, type DashboardManifest } from './manifest'

type Provider = 'anthropic' | 'openai' | 'gemini'

interface OrchestratorInstance {
  manifest: DashboardManifest
  agentStore: InMemoryAgentStore
  driver: IsolateDriver | null
}

// Singleton per process
let instance: OrchestratorInstance | null = null

function getOrCreateInstance(): OrchestratorInstance {
  if (!instance) {
    instance = {
      manifest: JSON.parse(JSON.stringify(INITIAL_MANIFEST)),
      agentStore: new InMemoryAgentStore(),
      driver: null,
    }
  }
  return instance
}

async function getDriver(inst: OrchestratorInstance): Promise<IsolateDriver> {
  if (!inst.driver) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    inst.driver = await createIsolateDriver('node')
  }
  return inst.driver
}

const ORCHESTRATOR_SYSTEM_PROMPT = `You are a dashboard orchestrator for an e-commerce sales dashboard. You manage specialized tile agents that each handle a domain:

- revenue_by_region: Quarterly revenue by region (APAC, EMEA, NA, LATAM). Growth rates, YoY comparisons, anomalies.
- product_performance: Product metrics across 5 categories. Rankings, trends, pricing.
- customer_overview: Customer metrics by tier (enterprise, pro, starter) and region. Signup trends, LTV.
- support_health: Support ticket metrics. Resolution times, backlogs, priority breakdowns.

Route questions to the relevant tile(s) using the query_tile tool. For broad questions like "How are things going?", query multiple tiles to get a comprehensive view.

When you get results back from tiles, synthesize them into a clear, coherent answer for the user. Reference specific numbers and highlight notable findings.

Important:
- Always use query_tile to get fresh data — don't make up numbers.
- For follow-up questions about a specific domain, route to that tile (it will have memory from previous queries).
- If a question spans multiple domains, make multiple query_tile calls.
- When querying multiple tiles, make all query_tile calls at once rather than sequentially.`

export async function handleDashboardChat(
  messages: Array<{ role: string; content: string }>,
  adapter: AnyTextAdapter,
) {
  const inst = getOrCreateInstance()
  const driver = await getDriver(inst)

  const queryTileTool = toolDefinition({
    name: 'query_tile' as any,
    description:
      'Query a specialized dashboard tile agent. Each tile has memory from previous queries and gets smarter over time. Available tiles: revenue_by_region, product_performance, customer_overview, support_health.',
    inputSchema: z.object({
      tileId: z
        .enum([
          'revenue_by_region',
          'product_performance',
          'customer_overview',
          'support_health',
        ])
        .describe('The tile agent to query'),
      question: z
        .string()
        .describe(
          'Natural language question for the tile agent. Be specific about what data you want.',
        ),
    }),
    outputSchema: z.object({
      tileId: z.string(),
      result: z.any(),
      agentName: z.string(),
      isWarm: z.boolean(),
    }),
  }).server(async (input, context) => {
    const tile = inst.manifest.tiles.find((t) => t.id === input.tileId)
    if (!tile) throw new Error(`Unknown tile: ${input.tileId}`)

    const isWarm = tile.agentName !== ''

    const emitDashboardEvent = (event: ExecutePromptEvent) => {
      context?.emitCustomEvent(`dashboard:${event.type}`, {
        ...event,
        tileId: tile.id,
        tileName: tile.name,
      })
    }

    const { data, agentName } = await executePrompt({
      adapter,
      prompt: input.question,
      system: tile.systemPrompt,
      tools: dashboardTools,
      driver,
      agentStore: inst.agentStore,
      agentName: tile.agentName || undefined,
      maxTokens: 8192,
      timeout: 60000,
      memoryLimit: 128,
      onEvent: emitDashboardEvent,
    })

    // Update manifest with warm agent name
    if (!isWarm) {
      tile.agentName = agentName
    }

    return {
      tileId: tile.id,
      result: data,
      agentName,
      isWarm,
    }
  })

  const abortController = new AbortController()

  const stream = chat({
    adapter,
    messages,
    tools: [queryTileTool],
    systemPrompts: [ORCHESTRATOR_SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(10),
    abortController,
    maxTokens: 8192,
  })

  const sseStream = toServerSentEventsStream(stream, abortController)
  return { sseStream, abortController }
}
