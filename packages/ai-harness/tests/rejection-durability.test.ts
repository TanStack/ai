import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import type { AnyTool } from '@tanstack/ai'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import {
  InputRejectedError,
  createHarnessHost,
  defineHarness,
  durableTool,
  logIdOf,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  gate,
  mockAdapter,
  ownershipExpired,
  text,
  toolCall,
  wrapLogStore,
} from './helpers'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { SessionImpl } from '../src/session/harness-session'
import type { HarnessSession, Operation, Receipt } from '../src'
import type { Reply } from './helpers'

const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
const LOG = logIdOf({ logId: THREAD })

const openScreen = toolDefinition({
  name: 'openScreen',
  description: 'Open a screen in the browser. Runs on the client.',
  inputSchema: z.object({ route: z.string() }),
  outputSchema: z.object({ opened: z.boolean() }),
})

const ping = toolDefinition({
  name: 'ping',
  description: 'Ping',
  inputSchema: z.object({}),
}).server(async () => 'pong')

const askCode = durableTool(
  toolDefinition({
    name: 'code',
    description: 'Ask for a code',
    inputSchema: z.object({}),
  }),
  async (_args, { step }) =>
    step.ask({
      name: 'code',
      message: 'Code?',
      schema: z.string(),
    }),
)

/** The next rejection append waits, or the next few rejection appends throw. */
function watchRejections(inner: LogStore) {
  let waiting:
    | { records?: ReadonlyArray<LogRecord>; release: () => void }
    | undefined
  let failuresLeft = 0
  const log = wrapLogStore(inner, {
    append: async (batch) => {
      const rejects = batch.records.some(
        (record) => record.type === 'harness.input.rejected',
      )
      if (rejects && failuresLeft > 0) {
        failuresLeft -= 1
        throw new Error('disk full')
      }
      if (rejects && waiting && waiting.records === undefined) {
        waiting.records = batch.records
        await new Promise<void>((resolve) => {
          waiting!.release = resolve
        })
      }
      return inner.append(batch)
    },
  })
  return {
    log,
    holdNext() {
      const slot: {
        records?: ReadonlyArray<LogRecord>
        release: () => void
      } = { release: () => {} }
      waiting = slot
      return slot
    },
    failNext(times: number) {
      failuresLeft = times
    },
  }
}

const typesOf = async (log: LogStore, inputId: string) =>
  (await log.read({ logId: LOG }))
    .map((entry) => entry.record)
    .filter((record) => record.inputId === inputId)
    .map((record) => record.type)

async function openOn(
  log: LogStore,
  replies: Array<Reply>,
  tools: Array<AnyTool> = [openScreen, ping],
  ownership?: typeof CRASHING_OWNERSHIP,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...(ownership ? { ownership } : {}),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/rejection-durability',
      adapter,
      tools,
    }),
    { threadId: THREAD },
  )
  return { host, session, calls, log }
}

/** Stop on a client tool, so the thread waits for an interrupt. */
async function interrupt(session: HarnessSession) {
  const turn = await session.send('Open settings.', { inputId: 'ask' })
  expect(turn.interrupts?.length).toBeGreaterThan(0)
}

/** The refusal lands in one append, and the receipt matches `reason`. */
async function expectAtomic(
  watch: ReturnType<typeof watchRejections>,
  run: () => Operation<unknown> | Promise<Receipt>,
  reason: string,
) {
  const slot = watch.holdNext()
  const result = run()
  if ('receipt' in result) {
    result.then(
      () => {},
      () => {},
    )
  }
  const receipt = 'receipt' in result ? result.receipt : result
  await waitFor(() => expect(slot.records).toBeDefined())
  expect(slot.records?.map((record) => record.type)).toEqual([
    'harness.input',
    'harness.input.rejected',
  ])
  slot.release()
  await expect(receipt).resolves.toMatchObject({ status: 'rejected', reason })
}

describe('a rejected input is durable before the receipt', () => {
  it('does not resolve the receipt before the log has the rejection', async () => {
    const inner = memoryLogStore()
    const watch = watchRejections(inner)
    const { host, session } = await openOn(watch.log, [
      () => toolCall('openScreen', { route: '/settings' }),
    ])
    await interrupt(session)

    const slot = watch.holdNext()
    let sawReceipt = false
    const followUp = session.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    followUp.then(
      () => {},
      () => {},
    )
    const receipt = followUp.receipt.then((value) => {
      sawReceipt = true
      return value
    })
    await waitFor(() => expect(slot.records).toBeDefined())
    expect(sawReceipt).toBe(false)
    expect(slot.records?.map((record) => record.type)).toEqual([
      'harness.input',
      'harness.input.rejected',
    ])
    expect(await typesOf(inner, 'reply-1')).toEqual([])

    slot.release()
    expect(await receipt).toMatchObject({
      inputId: 'reply-1',
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    expect(await typesOf(inner, 'reply-1')).toEqual([
      'harness.input',
      'harness.input.rejected',
    ])
    await host.close()
  })

  it('does not recover an input whose rejection never landed', async () => {
    const state = memoryLogState()
    const inner = memoryLogStore({ state })
    const watch = watchRejections(inner)
    const { host, session } = await openOn(
      watch.log,
      [() => toolCall('openScreen', { route: '/settings' })],
      [openScreen],
      CRASHING_OWNERSHIP,
    )
    await interrupt(session)

    const slot = watch.holdNext()
    const followUp = session.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    followUp.then(
      () => {},
      () => {},
    )
    await waitFor(() => expect(slot.records).toBeDefined())
    await ownershipExpired()

    const { adapter, calls } = mockAdapter([() => text('Recovered.')])
    const next = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state }) } },
    })
    const recovered = await next.open(
      defineHarness({
        name: 'test/rejection-durability',
        adapter,
        tools: [openScreen],
      }),
      { threadId: THREAD },
    )
    expect(await typesOf(inner, 'reply-1')).toEqual([])
    expect(calls).toHaveLength(0)
    expect(recovered.snapshot().status).not.toBe('running')

    slot.release()
    await next.close()
    await host.close().catch(() => {})
  })

  it('fails the operation when the rejection append fails', async () => {
    const inner = memoryLogStore()
    const watch = watchRejections(inner)
    const { host, session } = await openOn(watch.log, [
      () => toolCall('openScreen', { route: '/settings' }),
    ])
    await interrupt(session)
    watch.failNext(2)

    const followUp = session.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    followUp.then(
      () => {},
      () => {},
    )
    const receipt = await followUp.receipt
    expect(receipt.status).toBe('rejected')
    if (receipt.status === 'rejected') {
      expect(receipt.reason).not.toBe('pending_interrupts')
    }
    await expect(followUp).rejects.toThrow()
    expect(await typesOf(inner, 'reply-1')).toEqual([])
    await host.close().catch(() => {})
  })

  it('replays a rejection, and conflicts when the payload differs', async () => {
    const { host, session } = await openOn(memoryLogStore(), [
      () => toolCall('openScreen', { route: '/settings' }),
    ])
    await interrupt(session)
    const first = session.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    first.then(
      () => {},
      () => {},
    )
    expect(await first.receipt).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })

    const same = session.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    same.then(
      () => {},
      () => {},
    )
    expect(await same.receipt).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    await expect(same).rejects.toBeInstanceOf(InputRejectedError)

    const other = session.send('A different message.', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    other.then(
      () => {},
      () => {},
    )
    expect(await other.receipt).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await expect(other).rejects.toBeInstanceOf(InputRejectedError)
    await host.close()
  })

  it('replays a rejection through the offer lane', async () => {
    const state = memoryLogState()
    const owner = await openOn(memoryLogStore({ state }), [
      () => toolCall('openScreen', { route: '/settings' }),
    ])
    const otherHost = createHarnessHost({
      persistence: { stores: { log: memoryLogStore({ state }) } },
    })
    const other = await otherHost.open(
      defineHarness({
        name: 'test/rejection-durability',
        adapter: mockAdapter([]).adapter,
      }),
      { threadId: THREAD },
    )
    await interrupt(owner.session)

    const offered = other.send('And then?', {
      mode: 'followUp',
      inputId: 'reply-1',
    })
    offered.then(
      () => {},
      () => {},
    )
    await expect(
      other.settled({
        inputId: 'reply-1',
        signal: AbortSignal.timeout(3_000),
      }),
    ).rejects.toBeInstanceOf(InputRejectedError)

    const replay = async (message: string, reason: string) => {
      const sent = other.send(message, {
        mode: 'followUp',
        inputId: 'reply-1',
      })
      sent.then(
        () => {},
        () => {},
      )
      const receipt = await sent.receipt
      if (receipt.status === 'rejected') {
        expect(receipt.reason).toBe(reason)
        return
      }
      await expect(
        other.settled({
          inputId: 'reply-1',
          signal: AbortSignal.timeout(3_000),
        }),
      ).rejects.toMatchObject({ receipt: { reason } })
    }
    await replay('And then?', 'pending_interrupts')
    await replay('A different message.', 'conflict')

    await owner.host.close()
    await otherHost.close()
  })

  it('writes each post-admission refusal in the same append as the input', async () => {
    const inner = memoryLogStore()
    const watch = watchRejections(inner)
    const waiting = await openOn(watch.log, [
      () => toolCall('openScreen', { route: '/settings' }),
    ])
    await interrupt(waiting.session)
    await expectAtomic(
      watch,
      () =>
        waiting.session.send('Next.', { mode: 'followUp', inputId: 'follow' }),
      'pending_interrupts',
    )
    await expectAtomic(
      watch,
      () => waiting.session.send('Next prompt.', { inputId: 'prompt' }),
      'pending_interrupts',
    )
    await expectAtomic(
      watch,
      () => waiting.session.runTool({ name: 'ping', inputId: 'tool' }),
      'pending_interrupts',
    )
    await expectAtomic(
      watch,
      () => waiting.session.reset({ inputId: 'reset' }),
      'pending_interrupts',
    )
    await waiting.host.close()

    const busyLog = memoryLogStore()
    const busyWatch = watchRejections(busyLog)
    const release = gate()
    const busy = await openOn(busyWatch.log, [
      () =>
        (async function* () {
          await release.opened
          yield* text('Later.')
        })(),
    ])
    const running = busy.session.send('Go.', { inputId: 'go' })
    await running.receipt
    await expectAtomic(
      busyWatch,
      () => busy.session.send('No.', { inputId: 'no', busy: 'reject' }),
      'busy',
    )
    release.open()
    await running
    await busy.host.close()

    const idleLog = memoryLogStore()
    const idleWatch = watchRejections(idleLog)
    const idle = await openOn(idleWatch.log, [() => text('Hi.')])
    await expectAtomic(
      idleWatch,
      () =>
        idle.session.send('I refunded it.', {
          as: 'operator',
          inputId: 'operator',
        }),
      'no_human_wait',
    )
    await expectAtomic(
      idleWatch,
      () =>
        idle.session.resolve({
          resume: [{ interruptId: 'missing', status: 'cancelled' }],
          inputId: 'none',
        }),
      'no_pending_interrupts',
    )
    await idle.host.close()

    const askLog = memoryLogStore()
    const askWatch = watchRejections(askLog)
    const asking = await openOn(
      askWatch.log,
      [() => toolCall('code', {}, 'call-1'), () => text('ok')],
      [askCode],
    )
    const turn = asking.session.send('Ask me.', { inputId: 'ask-code' })
    turn.then(
      () => {},
      () => {},
    )
    const question = await waitFor(() => {
      const [wait] = asking.session.snapshot().pendingWaits
      expect(wait).toBeDefined()
      return wait!
    })
    await expectAtomic(
      askWatch,
      () =>
        asking.session.resolve({
          resume: [
            {
              interruptId: question.waitId,
              status: 'resolved',
              payload: 'secret',
            },
          ],
          inputId: 'use-answer',
        }),
      'use_answer',
    )
    await asking.session.answer({ questionId: question.waitId, value: 'key' })
    await turn
    await asking.host.close()

    // A run id that the log already has is a conflict on the next host.
    const takenLog = memoryLogStore()
    const takenWatch = watchRejections(takenLog)
    const firstHost = await openOn(takenWatch.log, [() => text('Hi.')])
    await (firstHost.session as unknown as SessionImpl).sendForRun('Hi.', {
      runId: 'run-1',
    })
    await firstHost.host.close()
    const nextHost = await openOn(takenWatch.log, [() => text('no')])
    const again = (message: string, inputId: string) =>
      (nextHost.session as unknown as SessionImpl).sendForRun(message, {
        runId: 'run-1',
        inputId,
      })
    await expectAtomic(
      takenWatch,
      () => again('Again.', 'run-again'),
      'conflict',
    )
    await expectAtomic(
      takenWatch,
      () =>
        (nextHost.session as unknown as SessionImpl).resolveForRun({
          resume: [{ interruptId: 'missing', status: 'cancelled' }],
          runId: 'run-1',
          inputId: 'resolve-run',
        }),
      'conflict',
    )
    await nextHost.host.close()
  })
})
