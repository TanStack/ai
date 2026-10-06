import { chat } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  KeyedAdapter,
  ModelMessage,
  UsageInfo,
} from '@tanstack/ai'

const SUMMARY_PROMPT =
  'Summarize the conversation so far for yourself. Keep decisions, open tasks, file names, and facts you still need. Leave out small talk.'

export function textOf(message: ModelMessage) {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part.type === 'text' ? part.content : ''))
      .join('')
  }
  return ''
}

/** One `role: text` line per message. Messages with no text are left out. */
export function transcriptText(messages: ReadonlyArray<ModelMessage>) {
  return messages
    .map((message) => `${message.role}: ${textOf(message)}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n')
}

/**
 * `/compact`: replace a long transcript with a summary, so later turns send
 * fewer tokens. The summary is written by `adapter`. A `keyedAdapter(...)`
 * is built with the user's key when `/compact` runs.
 */
export function compact(options: {
  adapter: AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
  keepLast?: number
}) {
  return definePlugin({
    name: 'tanstack/compact',
    setup: (ctx) => ({
      commands: {
        compact: defineCommand({
          description: 'Summarize the conversation to save tokens',
          run: async () => {
            const messages = await ctx.session.transcript()
            const keep = options.keepLast ?? 0
            if (messages.length <= keep + 2)
              return 'The conversation is already short.'
            const older = messages.slice(0, messages.length - keep)
            const transcript = transcriptText(older)
            const summary = await chat({
              adapter: await ctx.keys.adapter(options.adapter),
              messages: [
                { role: 'user', content: `${SUMMARY_PROMPT}\n\n${transcript}` },
              ],
              stream: false,
            })
            await ctx.session.replaceTranscript([
              {
                role: 'user',
                content: `Summary of our conversation so far:\n${summary}`,
              },
              {
                role: 'assistant',
                content: 'Understood. I will continue from this summary.',
              },
              ...messages.slice(messages.length - keep),
            ])
            return `Compacted ${older.length} messages into a summary.`
          },
        }),
      },
    }),
  })
}

interface UsageTotals {
  turns: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Input tokens the provider read from its prompt cache. */
  cachedTokens: number
  /** Input tokens the provider wrote to its prompt cache. */
  cacheWriteTokens: number
  /**
   * The input tokens of the latest model call of the lead turn: how much of
   * the model's context the conversation fills now.
   */
  contextTokens: number
  /** The cost in USD of the priced model calls. Only with the `model` option. */
  cost?: number
  /** The model calls that the `model` option had no prices for. */
  unpricedCalls?: number
}

/** Prices in USD per 1M tokens: the `cost` of an `@tanstack/ai-models` record. */
interface ModelPrices {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** The usage of an index entry before the host adds the tokens of a turn. */
const NO_TOKENS = {
  turns: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
}

/**
 * The cost in USD of one model call.
 * ponytail: the formula of `modelCost` in `@tanstack/ai-models`, copied, so
 * ai-harness does not depend on ai-models.
 */
function callCost(prices: ModelPrices, usage: UsageInfo) {
  const cached = usage.promptTokensDetails?.cachedTokens ?? 0
  const written = usage.promptTokensDetails?.cacheWriteTokens ?? 0
  // `promptTokens` counts the cache parts too, and each part has its own price.
  const uncached = usage.promptTokens - cached - written
  const part = (price: number | undefined, tokens: number) =>
    ((price ?? 0) / 1_000_000) * tokens
  return (
    part(prices.input, uncached) +
    part(prices.output, usage.completionTokens) +
    part(prices.cacheRead, cached) +
    part(prices.cacheWrite, written)
  )
}

/**
 * Count tokens across the session: the lead turn and every agent run
 * (subagents, background agents, and their children). `/usage` shows the
 * totals, with the input tokens read from and written to the prompt cache.
 * The plugin state also has `contextTokens`, the size of the lead
 * model's context at its latest call, for a UI.
 *
 * With `model`, the plugin also prices each model call. `model` gets the
 * model id of the call and returns its prices in USD per 1M tokens, or
 * `undefined` when it does not know the model. `/usage` then shows the
 * cost, and the plugin writes it to `usage.cost` of the session index
 * entry. A call with no prices adds no cost, and `/usage` says how many
 * calls it could not price.
 *
 * @example
 * ```ts
 * import { getModel } from '@tanstack/ai-models'
 *
 * plugins: () => [usage({ model: (id) => getModel('anthropic', id) })]
 * ```
 */
export function usage(
  options: {
    model?: (modelId: string) => { cost: ModelPrices } | undefined
  } = {},
) {
  return definePlugin({
    name: 'tanstack/usage',
    setup: (ctx) => {
      const state = ctx.state<UsageTotals>({
        turns: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        cacheWriteTokens: 0,
        contextTokens: 0,
      })
      const show = (totals: UsageTotals) => {
        // Only a provider that reports its prompt cache has these counts.
        const hasCache = totals.cachedTokens > 0 || totals.cacheWriteTokens > 0
        const cache = hasCache
          ? ` (${totals.cachedTokens} cache read, ${totals.cacheWriteTokens} cache write)`
          : ''
        const tokens = `${totals.turns} model calls, ${totals.promptTokens} input tokens${cache}, ${totals.completionTokens} output tokens, ${totals.totalTokens} total.`
        if (!options.model) return tokens
        const unpriced = totals.unpricedCalls ?? 0
        const note =
          unpriced > 0
            ? ` (cost unknown for ${unpriced} ${unpriced === 1 ? 'call' : 'calls'})`
            : ''
        return `${tokens} Cost: $${(totals.cost ?? 0).toFixed(4)}${note}.`
      }
      // The host adds the tokens of each turn to the index entry. This
      // plugin writes only `cost`, and keeps the tokens of the entry.
      const saveCost = async (cost: number) => {
        const entry = await ctx.session.entry()
        if (!entry) return
        // Before the first turn ends, the entry has no usage.
        const tokens = entry.usage ?? NO_TOKENS
        // ponytail: read, then write. A host write or another agent's write
        // between the two can be lost until the next priced call writes the
        // total again. Upgrade: a change function in updateEntry.
        await ctx.session.updateEntry({ usage: { ...tokens, cost } })
      }
      const counter = (lead: boolean) =>
        ({
          name: 'tanstack/usage',
          onUsage: async (run, info) => {
            const prices = options.model?.(run.model)?.cost
            const cost = prices ? callCost(prices, info) : undefined
            const isUnpriced = options.model !== undefined && cost === undefined
            const { cost: total } = await state.update((totals) => ({
              ...totals,
              ...(cost !== undefined ? { cost: (totals.cost ?? 0) + cost } : {}),
              ...(isUnpriced
                ? { unpricedCalls: (totals.unpricedCalls ?? 0) + 1 }
                : {}),
              turns: totals.turns + 1,
              promptTokens: totals.promptTokens + (info.promptTokens ?? 0),
              completionTokens:
                totals.completionTokens + (info.completionTokens ?? 0),
              totalTokens: totals.totalTokens + (info.totalTokens ?? 0),
              cachedTokens:
                totals.cachedTokens +
                (info.promptTokensDetails?.cachedTokens ?? 0),
              cacheWriteTokens:
                totals.cacheWriteTokens +
                (info.promptTokensDetails?.cacheWriteTokens ?? 0),
              contextTokens: lead
                ? (info.promptTokens ?? totals.contextTokens)
                : totals.contextTokens,
            }))
            if (cost === undefined || total === undefined) return
            // The index is only a list of sessions: a failed write does not
            // fail the turn. The next priced call writes the total again.
            await saveCost(total).catch(() => {})
          },
        }) satisfies AnyChatMiddleware
      return {
        // The same totals for the lead turn and every agent run. Only the
        // lead turn sets the context size.
        middleware: [counter(true)],
        agentMiddleware: [counter(false)],
        commands: {
          usage: defineCommand({
            description: 'Show token usage for this session',
            run: async () => show(await state.get()),
          }),
        },
      }
    },
  })
}
