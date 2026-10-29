import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
} from '../src'
import { mockAdapter, questionsOf, text, toolCall } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { LiveEvent, SessionEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'

const probe = toolDefinition({
  name: 'probe',
  description: 'Asks a question.',
  inputSchema: z.object({}),
})

/** A harness whose tool asks a question. Both hosts run the same one. */
function harnessWith(adapter: AnyTextAdapter) {
  const asker = definePlugin({
    name: 'test/asker',
    setup: () => ({
      tools: [
        durableTool(probe, async (_args, { step }) => ({
          sure: await step.ask({ name: 'sure', message: 'Sure?' }),
        })),
      ],
    }),
  })
  return defineHarness({
    name: 'test/remote-hooks',
    adapter,
    plugins: () => [asker],
  })
}

/** One model call that answers with usage, so the log has `harness.usage`. */
const withUsage = (content: string) =>
  text(content).map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        }
      : chunk,
  )

/** A host on `log` (one server), with the session of `THREAD` open. */
async function hostOn(log: LogStore, adapter: AnyTextAdapter) {
  const host = createHarnessHost({ persistence: { stores: { log } } })
  const session = await host.open(harnessWith(adapter), { threadId: THREAD })
  const statuses: Array<string> = []
  const reader = new AbortController()
  void (async () => {
    for await (const event of host.events({ signal: reader.signal })) {
      if (event.type === 'status' && event.threadId === THREAD)
        statuses.push(event.status)
    }
  })()
  const close = async () => {
    reader.abort()
    await session.close()
    await host.close()
  }
  return { host, session, statuses, close }
}

const isFinished = (event: LiveEvent['event']) =>
  event.type === EventType.CUSTOM && event.name === 'harness.operation.finished'

/** The `CUSTOM` names of `events`, with each name once per event. */
const customNames = (events: ReadonlyArray<LiveEvent>) =>
  events.flatMap(({ event }) =>
    event.type === EventType.CUSTOM ? [event.name] : [],
  )

describe('hooks on a host that does not own the log', () => {
  it('fire once for each event that the owner writes, and the status follows', async () => {
    const logState = memoryLogState()
    const owner = await hostOn(
      memoryLogStore({ state: logState }),
      mockAdapter([() => toolCall('probe', {}), () => withUsage('Done.')])
        .adapter,
    )
    const other = await hostOn(
      memoryLogStore({ state: logState }),
      mockAdapter([]).adapter,
    )
    const from = owner.session.snapshot().cursor
    const seen: Array<LiveEvent> = []
    const own: Array<LiveEvent> = []
    const questions: Array<string> = []
    const usages: Array<number> = []
    other.session.onEvent((entry) => void seen.push(entry))
    owner.session.onEvent((entry) => void own.push(entry))
    other.session.onQuestion(({ question }) => questions.push(question.message))
    other.session.onUsage(({ usage }) => usages.push(usage.totalTokens))

    const turn = owner.session.send('Go.')
    await waitFor(() =>
      expect(questionsOf(owner.session.snapshot())).toHaveLength(1),
    )
    await waitFor(() => expect(questions).toEqual(['Sure?']))
    await waitFor(() => expect(other.statuses.at(-1)).toBe('waiting'))
    const [question] = questionsOf(owner.session.snapshot())
    await owner.session.answer({
      questionId: question?.questionId ?? '',
      value: 'yes',
    })
    await turn
    await waitFor(() =>
      expect(seen.some(({ event }) => isFinished(event))).toBe(true),
    )

    // The other host saw each logged event once, in log order.
    const logged: Array<SessionEvent> = []
    for await (const entry of other.session.events({ from })) {
      logged.push(entry)
      if (isFinished(entry.event)) break
    }
    expect(seen).toEqual(
      logged.map(({ operationId, event }) => ({ operationId, event })),
    )
    expect(questions).toEqual(['Sure?'])
    expect(usages).toEqual([3])
    const statuses = ['idle', 'running', 'waiting', 'running', 'idle']
    expect(other.statuses).toEqual(statuses)
    expect(owner.statuses).toEqual(statuses)
    // The owner saw its own events at publish, and not again from the log.
    expect(customNames(own)).toEqual(customNames(seen))
    await other.close()
    await owner.close()
  })
})
