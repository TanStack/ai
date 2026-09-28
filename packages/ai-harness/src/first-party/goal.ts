import { EventType, chat } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { createPluginEvent } from '../extensions'
import { definePlugin } from '../plugins'
import { textOf, transcriptText } from './session-tools'
import type { AnyTextAdapter } from '@tanstack/ai'

/** The goal of a session. It is plugin state, so it survives restarts. */
export interface Goal {
  text: string
  status: 'active' | 'paused' | 'met' | 'stopped'
  /** The turns the plugin started for this goal. */
  round: number
  /** The reason of the last check. */
  reason: string
  /** Why the goal paused or stopped. Empty while it is active or met. */
  note: string
  /** The message of the turn that the plugin queued, until that turn starts. */
  queued: string
}

/** Sent when the judge says that the goal is met. */
export const GoalMet = createPluginEvent<{ goal: string; reason: string }>(
  'tanstack/goal:met',
)

const JUDGE_PROMPT =
  'You check the work of an agent. Read the goal and the last part of the conversation. Set met to true only when the conversation shows that the goal is done. Give a short reason.'
const USER_MESSAGE =
  'You sent a message, so the goal paused. Run /goal resume to continue.'
const TURN_FAILED = 'The last turn failed. Run /goal resume to try again.'
const WAITS_FOR_APPROVAL =
  'The last turn waits for approval. Answer it, then run /goal resume.'

function isVerdict(value: unknown): value is { met: boolean; reason: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'met' in value &&
    typeof value.met === 'boolean' &&
    'reason' in value &&
    typeof value.reason === 'string'
  )
}

function keepWorking(text: string, reason: string) {
  return `Keep working on the goal: ${text}. Last check: ${reason}`
}

function describe(saved: Goal | null, maxRounds: number) {
  if (!saved) return 'No goal. Start one with /goal <what done looks like>.'
  return [
    `Goal: ${saved.text}`,
    `Status: ${saved.status}, round ${saved.round} of ${maxRounds}.`,
    saved.note,
    saved.reason === '' ? '' : `Last check: ${saved.reason}`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * Keep the harness working until a goal is met. `/goal <text>` starts the
 * goal. After each turn, `judge` reads the goal and the end of the transcript
 * and decides if the goal is met. If it is not, the plugin starts the next
 * turn, up to `maxRounds` turns (default 20).
 *
 * The loop stops when the goal is met, at the round limit, when a turn waits
 * for approval or fails, and when the user sends a message. `/goal` shows the
 * goal, `/goal stop` ends it, and `/goal resume` continues it.
 *
 * @example
 * ```ts
 * plugins: () => [goal({ judge: openaiText('gpt-5.6-luna') })]
 * ```
 */
export function goal(options: { judge: AnyTextAdapter; maxRounds?: number }) {
  const maxRounds = options.maxRounds ?? 20
  return definePlugin({
    name: 'tanstack/goal',
    setup: async (ctx) => {
      const state = ctx.state<Goal | null>(null)
      // The prompt runs for each turn, so keep a copy of the goal at hand.
      let current = await state.get()
      // The run id of the plugin's own turn while it runs.
      let ownRun: string | undefined

      /** Change the goal, but only while `text` is still the active goal. */
      const change = async (text: string, next: Partial<Goal>) => {
        let applied = false
        current = await state.update((saved) => {
          const isActive =
            saved !== null && saved.status === 'active' && saved.text === text
          applied = isActive
          return isActive ? { ...saved, ...next } : saved
        })
        return applied
      }

      /** Make `text` the active goal with a new round count, and start a turn. */
      const begin = async (text: string, reason: string) => {
        const message =
          reason === ''
            ? `Work toward this goal: ${text}`
            : keepWorking(text, reason)
        // A turn that is still running belongs to the old goal.
        ownRun = undefined
        current = await state.update(() => ({
          text,
          status: 'active',
          round: 0,
          reason,
          note: '',
          queued: message,
        }))
        ctx.session.prompt(message)
      }

      /** Pause the goal when the plugin's own turn ends early. */
      const pauseOwnTurn = async (runId: string, note: string) => {
        if (runId !== ownRun || !current) return
        ownRun = undefined
        await change(current.text, { status: 'paused', note })
      }

      const judge = async (text: string) => {
        // ponytail: the last 10 messages, clipped. Summarize first if a judge needs more.
        const transcript = transcriptText(
          (await ctx.session.transcript()).slice(-10),
        ).slice(-8000)
        const verdict = await chat({
          adapter: options.judge,
          messages: [
            {
              role: 'user',
              content: `${JUDGE_PROMPT}\n\nGoal: ${text}\n\nThe last part of the conversation:\n${transcript}`,
            },
          ],
          outputSchema: {
            type: 'object',
            properties: {
              met: { type: 'boolean' },
              reason: { type: 'string' },
            },
            required: ['met', 'reason'],
          },
        })
        if (!isVerdict(verdict))
          throw new Error('The judge did not answer with met and reason.')
        return verdict
      }

      return {
        prompts: [
          {
            id: 'tanstack/goal:active',
            text: () =>
              current?.status === 'active'
                ? `You work toward this goal: ${current.text}. Keep going until it is done.`
                : '',
          },
        ],
        commands: {
          goal: defineCommand({
            description:
              'Work until a goal is met: /goal <goal>. Also /goal, /goal stop, /goal resume',
            run: async (input: unknown) => {
              const arg = typeof input === 'string' ? input.trim() : ''
              switch (arg) {
                case '':
                  return describe(current, maxRounds)
                case 'stop': {
                  const isRunning =
                    current?.status === 'active' || current?.status === 'paused'
                  if (!isRunning) return 'No goal is running.'
                  current = await state.update(
                    (saved) =>
                      saved && {
                        ...saved,
                        status: 'stopped',
                        note: 'You stopped the goal.',
                      },
                  )
                  return describe(current, maxRounds)
                }
                case 'resume': {
                  const canResume =
                    current?.status === 'paused' ||
                    current?.status === 'stopped'
                  if (!current || !canResume)
                    return describe(current, maxRounds)
                  await begin(current.text, current.reason)
                  return describe(current, maxRounds)
                }
                default:
                  await begin(arg, '')
                  return describe(current, maxRounds)
              }
            },
          }),
        },
        middleware: [
          {
            name: 'tanstack/goal',
            onConfig: async (run, config) => {
              const saved = current
              const last = config.messages.at(-1)
              // A turn with a new user message. A resume has none.
              const isNewMessage =
                run.phase === 'init' &&
                last !== undefined &&
                last.role === 'user'
              if (!isNewMessage || saved?.status !== 'active') return
              if (textOf(last) !== saved.queued) {
                await change(saved.text, {
                  status: 'paused',
                  note: USER_MESSAGE,
                })
                return
              }
              ownRun = run.runId
              await change(saved.text, { round: saved.round + 1, queued: '' })
            },
            onChunk: async (run, chunk) => {
              const isApproval =
                chunk.type === EventType.RUN_FINISHED &&
                chunk.outcome?.type === 'interrupt'
              if (isApproval) await pauseOwnTurn(run.runId, WAITS_FOR_APPROVAL)
              if (chunk.type === EventType.RUN_ERROR)
                await pauseOwnTurn(run.runId, TURN_FAILED)
            },
            onError: (run) => pauseOwnTurn(run.runId, TURN_FAILED),
            onAbort: (run) =>
              pauseOwnTurn(
                run.runId,
                'The last turn was cancelled. Run /goal resume to continue.',
              ),
            // chat() waits for onFinish, so the turn is still running here and
            // the next turn can only queue. It starts after this turn ends.
            onFinish: async (run) => {
              const saved = current
              if (run.runId !== ownRun || saved?.status !== 'active') return
              ownRun = undefined
              const { text, round } = saved
              const verdict = await judge(text).catch((error: unknown) =>
                error instanceof Error ? error.message : String(error),
              )
              if (typeof verdict === 'string') {
                await change(text, {
                  status: 'paused',
                  note: `The judge failed: ${verdict}`,
                })
                return
              }
              const { reason } = verdict
              if (verdict.met) {
                const met = await change(text, { status: 'met', reason })
                if (met) ctx.emit(GoalMet, { goal: text, reason })
                return
              }
              if (round >= maxRounds) {
                await change(text, {
                  status: 'stopped',
                  reason,
                  note: `The round limit (${maxRounds}) is reached. Run /goal resume for more rounds.`,
                })
                return
              }
              // The user queued a message while this turn ran.
              if (ctx.session.snapshot().queuedTurns > 0) {
                await change(text, {
                  status: 'paused',
                  reason,
                  note: USER_MESSAGE,
                })
                return
              }
              const message = keepWorking(text, reason)
              if (await change(text, { reason, queued: message }))
                ctx.session.prompt(message)
            },
          },
        ],
      }
    },
  })
}
