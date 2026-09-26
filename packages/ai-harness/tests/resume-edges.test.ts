import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessText } from '../src'
import {
  INTERRUPTED_TOOL_RESULT,
  findCrashedRuns,
  repairTranscript,
} from '../src/resume'
import { messageTexts, mockAdapter, text, untilAborted } from './helpers'
import type { RunRecord, StreamChunk } from '@tanstack/ai'
import type { HarnessPersistence } from '../src/host'

async function crash(
  persistence: ReturnType<typeof memoryPersistence>,
  runId: string,
  startedAt: number,
  pendingTools: NonNullable<RunRecord['checkpoint']>['pendingTools'] = [],
) {
  await persistence.stores.runs.createOrResume({
    runId,
    threadId: 't1',
    startedAt,
  })
  await persistence.stores.runs.update(runId, {
    leaseOwner: 'host-gone',
    leaseExpiresAt: Date.now() - 1_000,
    checkpoint: { at: startedAt, pendingTools },
  })
}

describe('crash recovery edges', () => {
  it('finds nothing when the run store cannot list a thread', async () => {
    const noRuns = { stores: {} } as unknown as HarnessPersistence
    expect(await findCrashedRuns(noRuns, 't1')).toEqual([])
    const noList = {
      stores: { runs: { get: async () => null } },
    } as unknown as HarnessPersistence
    expect(await findCrashedRuns(noList, 't1')).toEqual([])
  })

  it('continues only the newest crashed turn and fails the older ones', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'hello' },
    ])
    await crash(persistence, 'old-run', Date.now() - 120_000)
    await crash(persistence, 'new-run', Date.now() - 60_000)
    const { adapter, calls } = mockAdapter([() => text('picked up')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/two-crashes', adapter }),
      { threadId: 't1' },
    )
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))

    expect(await persistence.stores.runs.get('old-run')).toMatchObject({
      status: 'failed',
      error: { message: 'The host stopped during this turn.' },
    })
    expect(await persistence.stores.runs.get('new-run')).toMatchObject({
      status: 'failed',
      error: {
        message:
          'The host stopped. The session continued this turn in a new run.',
      },
    })
    await host.close()
  })

  it('leaves the transcript alone when no tool needs a note', async () => {
    const persistence = memoryPersistence()
    const history = [
      { id: 'u1', role: 'user' as const, content: 'go' },
      {
        id: 'a1',
        role: 'assistant' as const,
        content: '',
        toolCalls: [
          {
            id: 'call-a',
            type: 'function' as const,
            function: { name: 'charge', arguments: '{}' },
          },
        ],
      },
      {
        id: 't1',
        role: 'tool' as const,
        toolCallId: 'call-a',
        content: 'done',
      },
    ]
    await persistence.stores.messages.saveThread('t1', history)
    const save = vi.spyOn(persistence.stores.messages, 'saveThread')

    // Only safe tools pending: nothing to note.
    await repairTranscript(persistence, {
      runId: 'r',
      threadId: 't1',
      status: 'running',
      startedAt: 1,
      checkpoint: {
        at: 1,
        pendingTools: [
          { toolCallId: 'call-b', name: 'lookup', replay: 'safe' },
        ],
      },
    })
    // A never-replay tool that already has a result: nothing to note.
    await repairTranscript(persistence, {
      runId: 'r',
      threadId: 't1',
      status: 'running',
      startedAt: 1,
      checkpoint: {
        at: 1,
        pendingTools: [
          { toolCallId: 'call-a', name: 'charge', replay: 'never' },
        ],
      },
    })
    // No checkpoint at all.
    await repairTranscript(persistence, {
      runId: 'r',
      threadId: 't1',
      status: 'running',
      startedAt: 1,
    })
    expect(save).not.toHaveBeenCalled()
    expect(
      JSON.stringify(await persistence.stores.messages.loadThread('t1')),
    ).not.toContain(JSON.stringify(INTERRUPTED_TOOL_RESULT))
  })

  it('releases the lease timer when a turn fails', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      () =>
        (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
          }
          throw new Error('model down')
        })(),
    ])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/fails', adapter }),
      { threadId: 't-fail' },
    )
    const turn = session.prompt('hi')
    await expect(turn).rejects.toThrow('model down')
    expect(turn.status()).toBe('failed')
    await host.close()
  })
})

describe('harnessText edges', () => {
  it('uses a memory host by default and reads text content parts', async () => {
    const inner = mockAdapter([() => text('parts answer'), () => text('empty')])
    const studio = defineHarness({ name: 'test/parts', adapter: inner.adapter })
    const model = harnessText(studio)
    const collect = async (messages: Array<any>) => {
      let out = ''
      for await (const chunk of chat({ adapter: model, messages })) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) out += chunk.delta
      }
      return out
    }
    expect(
      await collect([
        {
          role: 'user',
          content: [
            { type: 'text', content: 'one ' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://x/y.png' },
            },
            { type: 'text', content: 'two' },
          ],
        },
      ]),
    ).toBe('parts answer')
    expect(messageTexts(inner.calls[0])).toEqual(['one two'])
    await expect(model.structuredOutput({} as never)).rejects.toThrow(
      'does not support structured output',
    )
  })

  it('reports an inner failure as a run error', async () => {
    const inner = mockAdapter([
      () =>
        (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
          }
          throw new Error('inner broke')
        })(),
    ])
    const studio = defineHarness({
      name: 'test/inner-fail',
      adapter: inner.adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of harnessText(studio, { host }).chatStream({
      model: 'test/inner-fail',
      messages: [{ role: 'assistant', content: 'no user message here' }],
    } as never)) {
      chunks.push(chunk)
    }
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'inner broke',
    })
    await host.close()
  })

  it('cancels the inner turn when the outer request aborts', async () => {
    const inner = mockAdapter([untilAborted()])
    const studio = defineHarness({
      name: 'test/inner-abort',
      adapter: inner.adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const controller = new AbortController()
    const stream = harnessText(studio, { host }).chatStream({
      model: 'test/inner-abort',
      threadId: 'outer',
      messages: [{ role: 'user', content: 'wait' }],
      request: { signal: controller.signal },
    } as never)
    const first = await stream[Symbol.asyncIterator]().next()
    expect(first.value).toMatchObject({ type: EventType.RUN_STARTED })
    await vi.waitFor(() => expect(inner.calls).toHaveLength(1))
    controller.abort()
    for await (const _chunk of stream) {
      // Drains until the cancelled inner turn ends.
    }
    await host.close()
  })
})

describe('session agent and operation lookups', () => {
  it('finds agents and operations by name and id', async () => {
    const echo = defineAgent({
      name: 'echo',
      description: 'Echoes',
      inputSchema: z.object({ text: z.string() }),
      run: async (ctx) => ctx.input.text.toUpperCase(),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/lookups',
        adapter: mockAdapter([]).adapter,
        agents: [echo],
      }),
      { threadId: 't' },
    )
    expect(session.agent('missing')).toBeUndefined()
    const handle = session.agent('echo')
    const run = handle?.run({ text: 'hi' })
    expect(await run).toBe('HI')
    expect(session.operation(run?.id ?? '')).toBe(run)
    expect(session.operation('nope')).toBeUndefined()
    await host.close()
  })
})
