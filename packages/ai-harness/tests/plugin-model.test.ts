import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { gate, mockAdapter, text, untilAborted } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { HarnessPlugin, SessionEvent } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'
const alice = { id: 'alice' }

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

/** `content` as one model call that reports 7 prompt and 3 completion tokens. */
const answerWithUsage =
  (content: string): Reply =>
  () =>
    text(content).map(
      (chunk): StreamChunk =>
        chunk.type === EventType.RUN_FINISHED
          ? {
              ...chunk,
              usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
            }
          : chunk,
    )

/** Open `THREAD` with `plugins`. The main model answers with `main`. */
async function open(plugins: Array<HarnessPlugin>, main: Array<Reply>) {
  const log = memoryLogStore()
  const { metadata } = memoryPersistence().stores
  const host = createHarnessHost({ persistence: { stores: { log, metadata } } })
  const session = await host.open(
    defineHarness({
      name: 'test/plugin-model',
      adapter: mockAdapter(main).adapter,
      plugins: () => plugins,
    }),
    { threadId: THREAD, user: alice },
  )
  return { host, session, log }
}

describe('ctx.model.chat', () => {
  it('counts the usage under plugin:<name> with the label, in the session and in the run', async () => {
    const checker = mockAdapter(answerWithUsage('looks fine'))
    let runId = ''
    const plugin = definePlugin({
      name: 'test/checker',
      setup: (ctx) => ({
        commands: {
          check: defineCommand({
            description: 'Check',
            run: async (_input, { run }) => {
              runId = run.runId
              const { text: answer } = await ctx.model.chat({
                adapter: checker.adapter,
                run,
                label: 'check',
                options: { messages: [{ role: 'user', content: 'Check it' }] },
              })
              return answer
            },
          }),
        },
      }),
    })
    const { host, session, log } = await open([plugin], [])
    const seen: Array<SessionEvent> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        seen.push(entry)
    })()

    expect(await session.runCommand({ name: 'check' })).toBe('looks fine')

    const usage = session.usage()
    expect(usage.total).toMatchObject({ calls: 1, totalTokens: 10 })
    expect(usage.bySource).toEqual({ 'plugin:test/checker': usage.total })
    expect(usage.bySender).toEqual({ alice: usage.total })
    const records = (await log.read({ logId: logIdOf({ logId: THREAD }) }))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.usage')
    expect(records).toEqual([
      expect.objectContaining({
        source: 'plugin:test/checker',
        label: 'check',
        runId,
        user: alice,
      }),
    ])
    await waitFor(() =>
      expect(
        seen.find(
          (entry) =>
            entry.event.type === EventType.CUSTOM &&
            entry.event.name === 'harness.usage',
        )?.event,
      ).toMatchObject({
        value: { source: 'plugin:test/checker', label: 'check' },
      }),
    )
    reader.abort()
    await reading.catch(() => {})
    await host.close()
  })

  it('uses the model and the run of the turn by default, and stops when the turn is cancelled', async () => {
    let call: Promise<unknown> | undefined
    const plugin = definePlugin({
      name: 'test/side-call',
      lifetime: 'turn',
      setup: (ctx) => ({
        middleware: [
          {
            name: 'test/side-call',
            onConfig: (run) => {
              if (run.phase !== 'init' || call) return
              call = ctx.model.chat({
                options: { messages: [{ role: 'user', content: 'Side' }] },
              })
              // The test reads the rejection below.
              call.catch(() => {})
            },
          },
        ],
      }),
    })
    // The plugin call and the turn both wait until they are aborted.
    const { host, session } = await open(
      [plugin],
      [untilAborted(), untilAborted()],
    )

    const turn = session.send('go')
    await waitFor(() => expect(call).toBeDefined())
    await turn.cancel()

    await expect(call).rejects.toThrow()
    await expect(turn).rejects.toThrow('Cancelled.')
    await host.close()
  })

  it('stops after timeoutMs', async () => {
    const slow = mockAdapter(untilAborted())
    const plugin = definePlugin({
      name: 'test/slow',
      setup: (ctx) => ({
        commands: {
          slow: defineCommand({
            description: 'Slow',
            run: async (_input, { run }) => {
              const failure = await ctx.model
                .chat({
                  adapter: slow.adapter,
                  run,
                  timeoutMs: 20,
                  options: { messages: [{ role: 'user', content: 'Wait' }] },
                })
                .then(
                  () => undefined,
                  (error: unknown) => error,
                )
              return failure instanceof Error ? failure.name : 'no error'
            },
          }),
        },
      }),
    })
    const { host, session } = await open([plugin], [])

    expect(await session.runCommand({ name: 'slow' })).toBe('TimeoutError')
    expect(slow.calls).toHaveLength(1)
    await host.close()
  })

  it('needs a run in a session plugin', async () => {
    let failure: unknown
    const plugin = definePlugin({
      name: 'test/no-run',
      setup: (ctx) => ({
        commands: {
          go: defineCommand({
            description: 'Go',
            run: async () => {
              failure = await ctx.model
                .chat({ options: { messages: [] } })
                .catch((error: unknown) => error)
            },
          }),
        },
      }),
    })
    const { host, session } = await open([plugin], [])

    await session.runCommand({ name: 'go' })

    expect(String(failure)).toContain(
      'ctx.model.chat of test/no-run needs a run',
    )
    await host.close()
  })

  it('records the usage of a call that ends after its run, with no event after the run finished', async () => {
    const late = gate()
    const checker = mockAdapter(() =>
      (async function* () {
        await late.opened
        yield* answerWithUsage('late')({})
      })(),
    )
    let call: Promise<unknown> | undefined
    let runId = ''
    const plugin = definePlugin({
      name: 'test/late',
      setup: (ctx) => ({
        commands: {
          go: defineCommand({
            description: 'Go',
            // Next to the run, as the title plugin does: not awaited.
            run: async (_input, { run }) => {
              runId = run.runId
              call = ctx.model.chat({
                adapter: checker.adapter,
                run,
                options: { messages: [{ role: 'user', content: 'Later' }] },
              })
            },
          }),
        },
      }),
    })
    const { host, session } = await open([plugin], [])
    const seen: Array<SessionEvent> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: reader.signal }))
        seen.push(entry)
    })()

    await session.runCommand({ name: 'go' })
    late.open()
    await call

    await waitFor(() => expect(session.usage().total.calls).toBe(1))
    const ofRun = seen.filter((entry) => entry.operationId === runId)
    const finished = ofRun.findIndex(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === 'harness.operation.finished',
    )
    expect(finished).toBeGreaterThan(-1)
    expect(ofRun.slice(finished + 1)).toEqual([])
    reader.abort()
    await reading.catch(() => {})
    await host.close()
  })
})
