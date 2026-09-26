import { chat } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'

const SUMMARY_PROMPT =
  'Summarize the conversation so far for yourself. Keep decisions, open tasks, file names, and facts you still need. Leave out small talk.'

function textOf(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part.type === 'text' ? part.content : ''))
      .join('')
  }
  return ''
}

/**
 * `/compact`: replace a long transcript with a summary, so later turns send
 * fewer tokens. The summary is written by `adapter`.
 */
export function compact(options: {
  adapter: AnyTextAdapter
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
            const transcript = older
              .map((message) => `${message.role}: ${textOf(message)}`)
              .filter((line) => !line.endsWith(': '))
              .join('\n')
            const summary = await chat({
              adapter: options.adapter,
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
}

/** Count tokens across the session. `/usage` shows the totals. */
export function usage() {
  return definePlugin({
    name: 'tanstack/usage',
    setup: (ctx) => {
      const state = ctx.state<UsageTotals>({
        turns: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      })
      const show = (totals: UsageTotals) =>
        `${totals.turns} model calls, ${totals.promptTokens} input tokens, ${totals.completionTokens} output tokens, ${totals.totalTokens} total.`
      return {
        middleware: [
          {
            name: 'tanstack/usage',
            onUsage: async (_run, info) => {
              await state.update((totals) => ({
                turns: totals.turns + 1,
                promptTokens: totals.promptTokens + (info.promptTokens ?? 0),
                completionTokens:
                  totals.completionTokens + (info.completionTokens ?? 0),
                totalTokens: totals.totalTokens + (info.totalTokens ?? 0),
              }))
            },
          },
        ],
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
