import { chat } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  KeyedAdapter,
  ModelMessage,
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
}

/**
 * Count tokens across the session: the lead turn and every agent run
 * (subagents, background agents, and their children). `/usage` shows the
 * totals, with the input tokens read from and written to the prompt cache.
 * The plugin state also has `contextTokens`, the size of the lead
 * model's context at its latest call, for a UI.
 */
export function usage() {
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
        return `${totals.turns} model calls, ${totals.promptTokens} input tokens${cache}, ${totals.completionTokens} output tokens, ${totals.totalTokens} total.`
      }
      const counter = (lead: boolean) =>
        ({
          name: 'tanstack/usage',
          onUsage: async (_run, info) => {
            await state.update((totals) => ({
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
