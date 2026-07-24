import type { Tool } from '@tanstack/ai'
import type { MemoryFragment, RecallResult, SaveReceipt } from '../../types'
import type { HindsightRuntime } from './index'

export interface HindsightToolDeps {
  getRuntime: () => Promise<HindsightRuntime>
  bankId: string
  budget: string
  onToolRetain?: (receipt: SaveReceipt) => void
  onToolRecall?: (query: string, result: RecallResult) => void
}

function stringField(args: unknown, key: string): string {
  if (args && typeof args === 'object' && key in args) {
    const value = (args as Record<string, unknown>)[key]
    if (typeof value === 'string') return value
  }
  return ''
}

/**
 * Build the hindsight LLM tools (retain / recall / reflect). These let the model
 * take direct control of long-term memory beyond the automatic recall/save the
 * middleware performs. Returned in `RecallResult.tools` and merged into the run.
 */
export function makeHindsightTools(deps: HindsightToolDeps): Array<Tool> {
  const retainTool: Tool = {
    name: 'hindsight_retain',
    description:
      'Explicitly store a fact, decision, or piece of context to remember in future sessions. Call this when the user shares something important about themselves, their preferences, their work, or any detail that should persist beyond this conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'The exact fact, decision, or piece of context to store. Write it as a self-contained statement that will still make sense out of conversation context.',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
    async execute(args) {
      const content = stringField(args, 'content')
      const start = Date.now()
      try {
        const { client } = await deps.getRuntime()
        const data = await client.retain(deps.bankId, content, {
          context: 'chat:tool',
          timestamp: new Date(),
        })
        deps.onToolRetain?.({
          ok: true,
          latencyMs: Date.now() - start,
          raw: data,
        })
        return { ok: true }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        deps.onToolRetain?.({ ok: false, latencyMs: Date.now() - start, error })
        return { ok: false, error }
      }
    },
  }

  const recallTool: Tool = {
    name: 'hindsight_recall',
    description:
      "Query memory directly with a specific question. Use this when you need context that may not have surfaced in the automatic recall — for example, to look up a different topic than the user's last message, or to find facts about an entity mentioned in passing.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language question or topic to look up.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(args) {
      const query = stringField(args, 'query')
      const start = Date.now()
      try {
        const { client, recallToPrompt } = await deps.getRuntime()
        const data = await client.recall(deps.bankId, query, {
          budget: deps.budget,
        })
        const systemPrompt = recallToPrompt(data)
        const fragments: Array<MemoryFragment> = (data.results ?? []).map(
          (r) => ({
            text: r.text,
            source: r.type ?? r.id,
          }),
        )
        deps.onToolRecall?.(query, {
          systemPrompt,
          fragments,
          latencyMs: Date.now() - start,
          raw: data,
        } as RecallResult)
        return systemPrompt || '(no relevant memories found)'
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return `(no memory available: ${error})`
      }
    },
  }

  const reflectTool: Tool = {
    name: 'hindsight_reflect',
    description:
      'Synthesize across many memories to answer questions that require reasoning over accumulated knowledge, rather than retrieving specific facts. Use this for questions like "what do I know about this user\'s stack?" or "what has the user been working on lately?"',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The synthesis question to reflect on, e.g. "what do I know about the user\'s preferences?"',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(args) {
      const query = stringField(args, 'query')
      try {
        const { client } = await deps.getRuntime()
        const data = await client.reflect(deps.bankId, query)
        return data.text ?? '(no reflection)'
      } catch (err) {
        return `(reflection failed: ${err instanceof Error ? err.message : String(err)})`
      }
    },
  }

  return [retainTool, recallTool, reflectTool]
}
