import { chat } from '@tanstack/ai'
import { createPluginEvent } from '../extensions'
import { definePlugin } from '../plugins'
import { textOf } from './session-tools'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  KeyedAdapter,
  ModelMessage,
} from '@tanstack/ai'

const TITLE_PROMPT =
  'Write a short title for a conversation that starts with the message below. Use at most 60 characters on one line, with no quotes. Answer with the title only.'

/** Sent when the title call fails. The turn does not fail. */
export const TitleFailed = createPluginEvent<{ message: string }>(
  'tanstack/title:failed',
)

/** The first line of `answer`, with no quotes around it, at most 60 characters. */
function cleanTitle(answer: string) {
  const line = answer.trim().split('\n')[0] ?? ''
  return line
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
    .slice(0, 60)
}

/**
 * Give each session a title. At the first turn of a session with no title,
 * `adapter` writes a short title from the first user message, and the plugin
 * saves it as the `title` of the session index entry. The call runs next to
 * the turn: it does not slow the turn, and a failure does not fail it. A
 * failure sends a {@link TitleFailed} event, and the next turn tries again.
 * Without `stores.sessions`, the plugin does nothing.
 *
 * @example
 * ```ts
 * plugins: () => [title({ adapter: openaiText('gpt-5.4-nano') })]
 * ```
 */
export function title(options: {
  adapter: AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
}) {
  return definePlugin({
    name: 'tanstack/title',
    setup: (ctx) => {
      let isNaming = false
      const name = async (messages: ReadonlyArray<ModelMessage>) => {
        const first = messages.find((message) => message.role === 'user')
        const entry = await ctx.session.entry()
        // No sessions store, or the session has a title (also after a restart).
        if (!first || !entry || entry.title) return
        // ponytail: the first 2000 characters are enough for a title.
        const message = textOf(first).slice(0, 2000)
        const answer = await chat({
          adapter: await ctx.keys.adapter(options.adapter),
          messages: [{ role: 'user', content: `${TITLE_PROMPT}\n\n${message}` }],
          stream: false,
        })
        const text = cleanTitle(answer)
        if (text) await ctx.session.updateEntry({ title: text })
      }
      return {
        middleware: [
          {
            name: 'tanstack/title',
            onConfig: (run, config) => {
              if (run.phase !== 'init' || isNaming) return
              isNaming = true
              // Not awaited: the title call never slows or fails the turn.
              void name(config.messages)
                .catch((error: unknown) =>
                  ctx.emit(TitleFailed, {
                    message:
                      error instanceof Error ? error.message : String(error),
                  }),
                )
                .finally(() => {
                  isNaming = false
                })
            },
          } satisfies AnyChatMiddleware,
        ],
      }
    },
  })
}
