/**
 * Hindsight memory adapter. Hindsight owns extraction/ranking server-side and
 * buckets memory into per-conversation "banks" (`{userId}__{sessionId}`). Recall
 * returns a rendered prompt block AND a set of LLM tools (retain/recall/reflect)
 * that let the model take direct control of memory.
 *
 * `@vectorize-io/hindsight-client` is an OPTIONAL peer dependency, loaded lazily.
 */

import { makeHindsightTools } from './tools'
import type {
  MemoryAdapter,
  MemoryFact,
  MemoryFragment,
  MemoryScope,
  MemorySnapshot,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '../../types'

/** Recall payload shape (the subset this adapter reads). */
export interface HindsightRecallResponse {
  results?: Array<{ text: string; type?: string; id: string }>
}

/**
 * Structural view of the hindsight client — only the methods this adapter uses.
 * Decouples the adapter from the SDK's exact type surface.
 */
export interface HindsightClientLike {
  retain: (
    bankId: string,
    text: string,
    opts: { context: string; timestamp: Date },
  ) => Promise<unknown>
  recall: (
    bankId: string,
    query: string,
    opts: { budget: string },
  ) => Promise<HindsightRecallResponse>
  reflect: (bankId: string, query: string) => Promise<{ text?: string }>
  listMemories: (
    bankId: string,
    opts: { limit: number },
  ) => Promise<{ items?: Array<Record<string, unknown>> }>
  getBankProfile: (bankId: string) => Promise<unknown>
  deleteBank: (bankId: string) => Promise<unknown>
}

export interface HindsightRuntime {
  client: HindsightClientLike
  recallToPrompt: (data: unknown) => string
}

export interface HindsightOptions {
  /** Durable user id used in the bank key. Falls back to `scope.userId`, then `'demo-user'`. */
  user?: string
  /** Hindsight server URL. Defaults to `HINDSIGHT_URL` or `http://localhost:8888`. */
  baseUrl?: string
  /** Recall budget. Defaults to `'mid'`. */
  budget?: 'low' | 'mid' | 'high'
  /** Fired when a `hindsight_retain` tool call completes. */
  onToolRetain?: (receipt: SaveReceipt) => void
  /** Fired when a `hindsight_recall` tool call completes. */
  onToolRecall?: (query: string, result: RecallResult) => void
}

const TOOL_GUIDANCE = `You have access to persistent long-term memory that survives across sessions.

Relevant memories for this turn have already been recalled and included in
your context. You also have three tools for direct control over memory:

- hindsight_retain(content): explicitly store a fact, decision, or piece of
  context you want to ensure is remembered in future sessions.

- hindsight_recall(query): query memory directly with a specific question,
  to look up a different topic than the user's last message.

- hindsight_reflect(question): synthesize across many memories to answer
  questions that require reasoning over accumulated knowledge.

Prefer to use these tools when they would meaningfully improve your response.
You do not need to call them on every turn.`

export function hindsight(options: HindsightOptions = {}): MemoryAdapter {
  const budget = options.budget ?? 'mid'
  let runtimePromise: Promise<HindsightRuntime> | null = null

  function getRuntime(): Promise<HindsightRuntime> {
    if (!runtimePromise) {
      runtimePromise = (async () => {
        const mod = await import('@vectorize-io/hindsight-client')
        const baseUrl =
          options.baseUrl ??
          process.env.HINDSIGHT_URL ??
          'http://localhost:8888'
        // oxlint-disable-next-line eslint-js/no-restricted-syntax -- intentionally decoupled from the SDK's exact client type; the adapter only uses the HindsightClientLike subset
        const client = new mod.HindsightClient({
          baseUrl,
        }) as unknown as HindsightClientLike
        const recallToPrompt = mod.recallResponseToPromptString as (
          data: unknown,
        ) => string
        return { client, recallToPrompt }
      })().catch((err) => {
        runtimePromise = null
        throw err
      })
    }
    return runtimePromise
  }

  function bankId(scope: MemoryScope): string {
    const user = options.user ?? scope.userId ?? 'demo-user'
    return `${user}__${scope.sessionId}`
  }

  return {
    id: 'hindsight',

    async save(scope, turn: MemoryTurn): Promise<Array<SaveReceipt>> {
      const bank = bankId(scope)
      const timestamp = new Date()
      async function retain(
        text: string,
        context: string,
      ): Promise<SaveReceipt> {
        const start = Date.now()
        try {
          const { client } = await getRuntime()
          const data = await client.retain(bank, text, { context, timestamp })
          return { ok: true, latencyMs: Date.now() - start, raw: data }
        } catch (err) {
          return {
            ok: false,
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }
      return Promise.all([
        retain(turn.user, 'chat:user'),
        retain(turn.assistant, 'chat:assistant'),
      ])
    },

    async recall(scope, query): Promise<RecallResult> {
      const bank = bankId(scope)
      const tools = makeHindsightTools({
        getRuntime,
        bankId: bank,
        budget,
        onToolRetain: options.onToolRetain,
        onToolRecall: options.onToolRecall,
      })
      try {
        const { client, recallToPrompt } = await getRuntime()
        const data = await client.recall(bank, query, { budget })
        const fragments: Array<MemoryFragment> = (data.results ?? []).map(
          (r) => ({
            text: r.text,
            source: r.type ?? r.id,
          }),
        )
        return {
          systemPrompt: recallToPrompt(data),
          fragments,
          tools,
          toolGuidance: TOOL_GUIDANCE,
          raw: data,
        }
      } catch (err) {
        return {
          systemPrompt: '',
          fragments: [],
          tools,
          toolGuidance: TOOL_GUIDANCE,
          raw: { error: err instanceof Error ? err.message : String(err) },
        }
      }
    },

    async inspect(scope): Promise<MemorySnapshot> {
      const bank = bankId(scope)
      try {
        const { client } = await getRuntime()
        const [memories, profile] = await Promise.all([
          client.listMemories(bank, { limit: 200 }),
          client.getBankProfile(bank),
        ])
        return {
          takenAt: new Date().toISOString(),
          data: { memories, profile },
        }
      } catch (err) {
        return {
          takenAt: new Date().toISOString(),
          data: { error: err instanceof Error ? err.message : String(err) },
        }
      }
    },

    async listFacts(scope): Promise<Array<MemoryFact>> {
      const bank = bankId(scope)
      try {
        const { client } = await getRuntime()
        const res = await client.listMemories(bank, { limit: 200 })
        const items = res.items ?? []
        return items
          .map((m, i): MemoryFact | null => {
            const text =
              (typeof m.text === 'string' ? m.text : undefined) ??
              (typeof m.content === 'string' ? m.content : undefined)
            if (!text) return null
            return {
              id: typeof m.id === 'string' ? m.id : `hindsight-${i}`,
              text,
              source: typeof m.context === 'string' ? m.context : 'memory',
              createdAt:
                typeof m.created_at === 'string' ? m.created_at : undefined,
            }
          })
          .filter((f): f is MemoryFact => f !== null)
      } catch {
        return []
      }
    },
  }
}

export { makeHindsightTools } from './tools'
