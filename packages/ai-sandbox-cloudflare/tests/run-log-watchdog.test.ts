import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { DurableObjectRunEventLog } from '../src/run-log-do'
import { InMemoryRunEventLog } from '../src/run-log'
import { fakeDurableStorage } from './fixtures'
import type { RunEventLog } from '../src/run-log'
import type { StreamChunk } from '@tanstack/ai'

type AssertRunEventLog<T extends RunEventLog> = T
type ThirdPartyRunEventLog = AssertRunEventLog<
  Omit<InMemoryRunEventLog, 'touch' | 'finishIfStale'>
>
type WatchdogLog = ThirdPartyRunEventLog &
  Pick<InMemoryRunEventLog, 'touch' | 'finishIfStale'>

const implementations: Array<[string, () => WatchdogLog]> = [
  ['in-memory', () => new InMemoryRunEventLog()],
  ['durable', () => new DurableObjectRunEventLog(fakeDurableStorage())],
]

const errorChunk = (
  message: string,
  code?: string,
): Extract<StreamChunk, { type: 'RUN_ERROR' }> => ({
  type: EventType.RUN_ERROR,
  message,
  ...(code === undefined ? {} : { code }),
})

async function collect(log: WatchdogLog) {
  const events = []
  for await (const event of log.read('run-1')) events.push(event)
  return events
}

describe('watchdog run-log contract', () => {
  afterEach(() => vi.restoreAllMocks())

  describe.each(implementations)('%s', (_name, createLog) => {
    it('enforces touch and strict stale-finish semantics', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(100)
      const log = createLog()
      const errors = ['first', 'second'].map((message, index) =>
        errorChunk(message, String(index)),
      )

      await log.open({ runId: 'run-1', threadId: 'thread-1' })
      await log.touch('unknown')
      const before = await log.get('run-1')
      if (!before) throw new Error('expected run')

      now.mockReturnValue(200)
      await log.touch('run-1')
      expect(await log.get('run-1')).toEqual({ ...before, updatedAt: 200 })
      expect(await log.finishIfStale('run-1', 200, errors[0]!)).toBe(false)

      now.mockReturnValue(300)
      const winners = await Promise.all(
        errors.map((error) => log.finishIfStale('run-1', 201, error)),
      )
      expect(winners.filter(Boolean)).toHaveLength(1)

      const events = await collect(log)
      expect(events).toHaveLength(1)
      const [event] = events
      expect(event?.seq).toBe(0)
      expect(event?.chunk.type).toBe(EventType.RUN_ERROR)
      if (event?.chunk.type !== EventType.RUN_ERROR) {
        throw new Error('expected terminal error')
      }
      const terminal = await log.get('run-1')
      expect(terminal).toMatchObject({
        status: 'failed',
        lastSeq: 0,
        error: { message: event.chunk.message, code: event.chunk.code },
        finishedAt: 300,
        updatedAt: 300,
      })

      now.mockReturnValue(400)
      await log.touch('run-1')
      expect(await log.get('run-1')).toEqual(terminal)
      await log.update('run-1', { status: 'completed', finishedAt: 400 })
      expect(await log.get('run-1')).toEqual(terminal)
    })
  })
})
