import { chat } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import { emptyUsage } from '../usage'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  KeyedAdapter,
  ModelMessage,
} from '@tanstack/ai'
import type { SessionUsage, UsageCounts } from '../usage'

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
            const { text: summary } = await chat({
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

/** Prices in USD per 1M tokens: the `cost` of an `@tanstack/ai-models` record. */
interface ModelPrices {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** The usage of an index entry before the host writes the tokens of a turn. */
const NO_TOKENS = {
  turns: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
}

/**
 * The cost in USD of some model calls of one model.
 * ponytail: the formula of `modelCost` in `@tanstack/ai-models`, copied, so
 * ai-harness does not depend on ai-models.
 */
function priceOf(prices: ModelPrices, counts: UsageCounts) {
  const { cachedTokens, cacheWriteTokens } = counts
  // `promptTokens` counts the cache parts too, and each part has its own price.
  const uncached = counts.promptTokens - cachedTokens - cacheWriteTokens
  const part = (price: number | undefined, tokens: number) =>
    ((price ?? 0) / 1_000_000) * tokens
  return (
    part(prices.input, uncached) +
    part(prices.output, counts.completionTokens) +
    part(prices.cacheRead, cachedTokens) +
    part(prices.cacheWrite, cacheWriteTokens)
  )
}

/** One `/usage` line: the calls and tokens of `counts`. */
function usageLine(counts: UsageCounts) {
  // Only a provider that reports its prompt cache has these counts.
  const hasCache = counts.cachedTokens > 0 || counts.cacheWriteTokens > 0
  const cache = hasCache
    ? ` (${counts.cachedTokens} cache read, ${counts.cacheWriteTokens} cache write)`
    : ''
  return `${counts.calls} model calls, ${counts.promptTokens} input tokens${cache}, ${counts.completionTokens} output tokens, ${counts.totalTokens} total.`
}

/**
 * Show the token usage of the session (`session.usage()`): the lead turn and
 * every agent run (subagents, background agents, and their children).
 * `/usage` shows the totals, with the input tokens read from and written to
 * the prompt cache, and a line for each model when there is more than one.
 * The plugin state, for a UI, has a copy of `session.usage().total` and
 * `contextTokens`, the size of the lead model's context at its latest call.
 *
 * A model call that has a cost from its provider keeps that cost. With
 * `model`, the plugin also prices the calls that have no provider cost.
 * `model` gets the model id and returns its prices in USD per 1M tokens, or
 * `undefined` when it does not know the model. `/usage` shows the cost when
 * a call has one, and says how many calls it could not price. When a call
 * has a cost, the plugin writes the cost to `usage.cost` of the session
 * index entry.
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
      /**
       * A copy of the session totals, and `contextTokens`: the input tokens
       * of the latest model call of the lead turn, so how much of the
       * model's context the conversation fills now.
       */
      const state = ctx.state({ ...emptyUsage().total, contextTokens: 0 })
      // The cost of the model calls of one model, else `undefined`.
      const costOf = (model: string, counts: UsageCounts) => {
        if (counts.cost !== undefined) return counts.cost
        // The key is `provider/model`. The lookup gets the model id only.
        const prices = options.model?.(model.slice(model.indexOf('/') + 1))
        return prices && priceOf(prices.cost, counts)
      }
      /**
       * The cost of the session, and how many calls have no cost. `cost` is
       * `undefined` when no call has one.
       * ponytail: core sums by model. When a model has a provider cost, its
       * calls with no provider cost add nothing. Upgrade: core keeps, by
       * model, the counts of the calls with no provider cost.
       */
      const sessionCost = (totals: SessionUsage) => {
        let cost: number | undefined
        let unpriced = 0
        for (const [model, counts] of Object.entries(totals.byModel)) {
          const modelCost = costOf(model, counts)
          if (modelCost === undefined) unpriced += counts.calls
          else cost = (cost ?? 0) + modelCost
        }
        return { cost, unpriced }
      }
      const show = () => {
        const totals = ctx.session.snapshot().usage
        const { cost, unpriced } = sessionCost(totals)
        const note =
          unpriced > 0
            ? ` (cost unknown for ${unpriced} ${unpriced === 1 ? 'call' : 'calls'})`
            : ''
        const isPriced = options.model !== undefined || cost !== undefined
        const priced = isPriced
          ? ` Cost: $${(cost ?? 0).toFixed(4)}${note}.`
          : ''
        const lines = [`${usageLine(totals.total)}${priced}`]
        const models = Object.entries(totals.byModel)
        // One model has the same counts as the total.
        if (models.length > 1) {
          for (const [model, counts] of models) {
            lines.push(`${model}: ${usageLine(counts)}`)
          }
        }
        return lines.join('\n')
      }
      // The host writes the token totals to the index entry at the end of
      // each turn. This plugin writes only `cost`, and keeps the tokens of
      // the entry.
      // ponytail: a host with a log counts a call when its log write lands,
      // which can be after the run ends. Then the entry and the state get
      // that call at the end of the next run or call. Upgrade: the host
      // writes the cost at turn end.
      const saveCost = async () => {
        const { cost } = sessionCost(ctx.session.snapshot().usage)
        if (cost === undefined) return
        const entry = await ctx.session.entry()
        if (!entry) return
        // Before the first turn ends, the entry has no usage.
        const tokens = entry.usage ?? NO_TOKENS
        // ponytail: read, then write. A host write or another agent's write
        // between the two can be lost until the next run writes the total
        // again. Upgrade: a change function in updateEntry.
        await ctx.session.updateEntry({ usage: { ...tokens, cost } })
      }
      // Copy the session totals to the state. Only a call of the lead turn
      // sets the context size.
      const mirror = (contextTokens?: number) =>
        state.update((current) => ({
          ...ctx.session.snapshot().usage.total,
          contextTokens: contextTokens ?? current.contextTokens,
        }))
      // At the end of each run, the state gets the totals and the index entry
      // gets the cost so far. The index is only a list of sessions, and the
      // state only a copy: a failed write does not fail the run. The next run
      // writes them again.
      const save = async () => {
        await Promise.all([mirror(), saveCost()]).catch(() => {})
      }
      const atRunEnd = {
        name: 'tanstack/usage',
        onFinish: save,
        onAbort: save,
        onError: save,
      } satisfies AnyChatMiddleware
      return {
        middleware: [
          {
            ...atRunEnd,
            onUsage: async (_run, info) => {
              await mirror(info.promptTokens)
            },
          } satisfies AnyChatMiddleware,
        ],
        // An agent's middleware runs before the host counts its call, so its
        // run copies the totals only at its end.
        agentMiddleware: [atRunEnd],
        commands: {
          usage: defineCommand({
            description: 'Show token usage for this session',
            run: show,
          }),
        },
      }
    },
  })
}
