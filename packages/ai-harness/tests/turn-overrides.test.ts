import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
} from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type {
  AnyChatMiddleware,
  AnyTool,
  ModelMessage,
  PromptCacheOptions,
  ReasoningRequest,
} from '@tanstack/ai'
import type { HarnessConfig, PluginContributions } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'
const HIGH: ReasoningRequest = { level: 'high', summary: true }
const LOW: ReasoningRequest = { level: 'low', summary: false }

afterEach(() => {
  vi.unstubAllEnvs()
})

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/** Open a session whose default adapter answers with `replies`. */
async function open(
  replies: Array<Reply>,
  extras: Omit<HarnessConfig, 'name' | 'adapter'> = {},
  options: { persistence?: Durable; promptCache?: PromptCacheOptions } = {},
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence: options.persistence ?? memoryPersistence(),
  })
  const session = await host.open(
    defineHarness({ name: 'test/turn-overrides', adapter, ...extras }),
    {
      threadId: THREAD,
      ...(options.promptCache ? { promptCache: options.promptCache } : {}),
    },
  )
  return { host, session, calls }
}

/** A tool that answers `found`, after `during` when it is set. */
const lookupTool = (during?: () => Promise<void>) =>
  toolDefinition({
    name: 'lookup',
    description: 'Look something up',
    inputSchema: z.object({ q: z.string() }),
  }).server(async () => {
    await during?.()
    return 'found'
  })

const lookup = lookupTool()

/** A model call that ends with a RUN_ERROR. */
const failsWith =
  (message: string): Reply =>
  () => [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    },
    { type: EventType.RUN_ERROR, message, timestamp: Date.now() },
  ]

/** The names of the tools the adapter got on one call. */
const toolNames = (call: { tools?: ReadonlyArray<AnyTool> }) =>
  (call.tools ?? []).map((tool) => tool.name)

/** The content of the tool result for `toolCallId` in the transcript. */
const toolResult = (
  transcript: ReadonlyArray<ModelMessage>,
  toolCallId: string,
) =>
  transcript.find(
    (message) => message.role === 'tool' && message.toolCallId === toolCallId,
  )?.content

/** The records of the log, of one type. */
async function recordsOf(persistence: Durable, type: string) {
  return (await persistence.stores.log.read(THREAD))
    .map((entry) => entry.record)
    .filter((record) => record.type === type)
}

describe('turn overrides: adapter', () => {
  it('uses the turn adapter in the tool loop and in a retry, then the default again', async () => {
    const turnModel = mockAdapter([
      () => toolCall('lookup', { q: 'x' }),
      failsWith('overloaded'),
      () => text('done'),
    ])
    const { host, session, calls } = await open([() => text('default')], {
      tools: [lookup],
      turn: {
        onModelError: ({ retries }) => (retries === 0 ? 'retry' : undefined),
      },
    })

    expect(
      await session.prompt('go', { overrides: { adapter: turnModel.adapter } }),
    ).toEqual({ text: 'done' })
    expect(await session.prompt('again')).toEqual({ text: 'default' })

    expect(turnModel.calls).toHaveLength(3)
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('builds a keyed turn adapter with the key of the user', async () => {
    vi.stubEnv('TURN_OVERRIDES_TEST_KEY', 'sk-env-1234')
    const provider = defineByokProvider({
      id: 'turn-test',
      label: 'Turn test',
      env: 'TURN_OVERRIDES_TEST_KEY',
    })
    const turnModel = mockAdapter([() => text('keyed')])
    const keys: Array<string> = []
    const keyed = keyedAdapter(provider, (key) => {
      keys.push(key)
      return turnModel.adapter
    })
    const { host, session } = await open([])

    expect(
      await session.prompt('go', { overrides: { adapter: keyed } }),
    ).toEqual({ text: 'keyed' })
    expect(keys).toEqual(['sk-env-1234'])
    await host.close()
  })

  it('runs a followUp with its overrides', async () => {
    const turnModel = mockAdapter([() => text('followed')])
    const { host, session, calls } = await open([])

    await session.followUp('go', {
      inputId: 'follow-1',
      overrides: { adapter: turnModel.adapter },
    })

    expect(await session.settled('follow-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(turnModel.calls).toHaveLength(1)
    expect(calls).toHaveLength(0)
    await host.close()
  })
})

describe('turn overrides: reasoning and prompt cache', () => {
  it('sends the turn reasoning and prompt cache for that turn only', async () => {
    const { host, session, calls } = await open(
      [() => text('a'), () => text('b')],
      {},
      { promptCache: 'long' },
    )

    await session.prompt('go', {
      overrides: { reasoning: HIGH, promptCache: { key: 'turn-key' } },
    })
    await session.prompt('again')

    expect(calls[0].reasoning).toEqual({ level: 'high', summary: true })
    // The session retention stays. Only the key changes.
    expect(calls[0].promptCache).toEqual({
      retention: 'long',
      key: 'turn-key',
    })
    expect(calls[1].reasoning).toBeUndefined()
    expect(calls[1].promptCache).toEqual({ retention: 'long', key: THREAD })
    await host.close()
  })

  it('takes a reasoning level alone, the same as chat()', async () => {
    const { host, session, calls } = await open(
      [() => text('a'), () => text('b')],
      { reasoning: 'low' },
    )

    await session.prompt('one')
    await session.prompt('two', { overrides: { reasoning: 'high' } })

    expect(calls.map((call) => call.reasoning)).toEqual([
      { level: 'low', summary: true },
      { level: 'high', summary: true },
    ])
    await host.close()
  })

  it('sends HarnessConfig.reasoning on every turn, and a turn value replaces it', async () => {
    const { host, session, calls } = await open(
      [() => text('a'), () => text('b'), () => text('c')],
      { reasoning: LOW },
    )

    await session.prompt('one')
    await session.prompt('two')
    await session.prompt('three', { overrides: { reasoning: HIGH } })

    expect(calls.map((call) => call.reasoning)).toEqual([
      { level: 'low', summary: false },
      { level: 'low', summary: false },
      { level: 'high', summary: true },
    ])
    await host.close()
  })
})

describe('turn overrides: tools', () => {
  it('lets the model call a turn tool in that turn only', async () => {
    const { host, session, calls } = await open([
      () => toolCall('lookup', { q: 'x' }, 'call-lookup'),
      () => text('done'),
      () => text('again'),
    ])

    await session.prompt('go', { overrides: { tools: [lookup] } })
    await session.prompt('again')

    expect(toolResult(await session.transcript(), 'call-lookup')).toBe('found')
    expect(toolNames(calls[0])).toEqual(['lookup'])
    expect(toolNames(calls[2])).toEqual([])
    await host.close()
  })

  it('keeps a turn tool when a middleware returns only the static tools', async () => {
    const look = toolDefinition({ name: 'look', description: 'Look' }).server(
      async () => 'seen',
    )
    const onlyStatic: AnyChatMiddleware = {
      name: 'only-static',
      onConfig: () => ({ tools: [look] }),
    }
    const { host, session, calls } = await open(
      [() => toolCall('lookup', { q: 'x' }, 'call-lookup'), () => text('done')],
      { tools: [look], middleware: [onlyStatic] },
    )

    await session.prompt('go', { overrides: { tools: [lookup] } })

    expect(toolNames(calls[0])).toEqual(['look', 'lookup'])
    expect(toolResult(await session.transcript(), 'call-lookup')).toBe('found')
    await host.close()
  })

  it('gives a durable turn tool step and append on a durable host', async () => {
    const persistence = durablePersistence()
    const note = durableTool(
      toolDefinition({ name: 'note', description: 'Write a note' }),
      async (_args, { step, append }) => {
        append([{ type: 'app.note', value: 1 }])
        return step.do('write', async () => 'noted')
      },
    )
    const { host, session } = await open(
      [() => toolCall('note', {}, 'call-note'), () => text('done')],
      {},
      { persistence },
    )

    await session.prompt('note it', { overrides: { tools: [note] } })

    expect(toolResult(await session.transcript(), 'call-note')).toBe('noted')
    expect(await recordsOf(persistence, 'app.note')).toEqual([
      { type: 'app.note', value: 1 },
    ])
    expect(
      (await recordsOf(persistence, 'harness.tool.step')).map(
        (record) => record.name,
      ),
    ).toEqual(['write'])
    await host.close()
  })

  it('fails a turn tool with the name of a static tool, like two static tools', async () => {
    const other = toolDefinition({
      name: 'lookup',
      description: 'Look something up somewhere else',
      inputSchema: z.object({ q: z.string() }),
    }).server(async () => 'other')
    const duplicate =
      'Cannot pass two tools named "lookup" in the same chat() call.'
    const twoStatic = await open([() => text('never')], {
      tools: [lookup, other],
    })
    const clash = await open([() => text('never')], { tools: [lookup] })

    await expect(twoStatic.session.prompt('go')).rejects.toThrow(duplicate)
    await expect(
      clash.session.prompt('go', { overrides: { tools: [other] } }),
    ).rejects.toThrow(duplicate)

    expect(clash.calls).toHaveLength(0)
    await twoStatic.host.close()
    await clash.host.close()
  })
})

describe('turn overrides: queue, steer, and recovery', () => {
  it('runs a queued turn with its overrides after the running turn ends', async () => {
    const release = gate()
    const turnModel = mockAdapter([() => text('second')])
    const { host, session, calls } = await open([
      after(release.opened, 'first'),
    ])

    const first = session.prompt('one')
    const second = session.prompt('two', {
      overrides: { adapter: turnModel.adapter },
    })
    expect((await second.receipt).status).toBe('queued')
    release.open()

    expect(await first).toEqual({ text: 'first' })
    expect(await second).toEqual({ text: 'second' })
    expect(calls).toHaveLength(1)
    expect(turnModel.calls).toHaveLength(1)
    await host.close()
  })

  it('gives a steer that joins a turn the overrides of that turn', async () => {
    const toolRuns = gate()
    const release = gate()
    const slowLookup = lookupTool(async () => {
      toolRuns.open()
      await release.opened
    })
    const hostModel = mockAdapter([
      () => toolCall('lookup', { q: 'x' }),
      () => text('done'),
    ])
    const steerModel = mockAdapter([() => text('never')])
    const { host, session, calls } = await open([], { tools: [slowLookup] })

    const turn = session.prompt('one', {
      overrides: { adapter: hostModel.adapter },
    })
    await toolRuns.opened
    const steer = session.prompt('two', {
      busy: 'steer',
      overrides: { adapter: steerModel.adapter },
    })
    await steer.receipt
    release.open()

    expect(await turn).toEqual({ text: 'done' })
    expect(await steer).toEqual({ text: 'done' })
    expect(messageTexts(hostModel.calls[1])).toContain('two')
    expect(steerModel.calls).toHaveLength(0)
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('runs a steer that does not join as its own turn, with its own overrides', async () => {
    const release = gate()
    const hostModel = mockAdapter([after(release.opened, 'first')])
    const steerModel = mockAdapter([() => text('second')])
    const { host, session, calls } = await open([], {
      turn: { canJoin: () => false },
    })

    const turn = session.prompt('one', {
      overrides: { adapter: hostModel.adapter },
    })
    await vi.waitFor(() => expect(hostModel.calls).toHaveLength(1))
    const steer = session.prompt('two', {
      busy: 'steer',
      overrides: { adapter: steerModel.adapter },
    })
    await steer.receipt
    release.open()

    expect(await turn).toEqual({ text: 'first' })
    expect(await steer).toEqual({ text: 'second' })
    expect(hostModel.calls).toHaveLength(1)
    expect(steerModel.calls).toHaveLength(1)
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it('runs a recovered turn after a restart with the defaults', async () => {
    const persistence = durablePersistence()
    const stopped = mockAdapter([untilAborted()])
    const first = await open([], {}, { persistence })
    const turn = first.session.prompt('go', {
      inputId: 'in-1',
      overrides: {
        adapter: stopped.adapter,
        reasoning: HIGH,
        promptCache: { key: 'turn-key' },
      },
    })
    await vi.waitFor(() => expect(stopped.calls).toHaveLength(1))
    // The first host stops: its run lease expires.
    await persistence.stores.runs.update(turn.id, {
      leaseExpiresAt: Date.now() - 1,
    })

    const next = await open([() => text('recovered')], {}, { persistence })

    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(stopped.calls).toHaveLength(1)
    expect(next.calls).toHaveLength(1)
    expect(next.calls[0].reasoning).toBeUndefined()
    expect(next.calls[0].promptCache).toEqual({
      retention: 'short',
      key: THREAD,
    })
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('runs a recovered turn with the overrides that the recover hook returns', async () => {
    const persistence = durablePersistence()
    const stopped = mockAdapter([untilAborted()])
    const first = await open([], {}, { persistence })
    const turn = first.session.prompt('go', {
      inputId: 'in-1',
      overrides: { adapter: stopped.adapter },
    })
    await vi.waitFor(() => expect(stopped.calls).toHaveLength(1))
    // The first host stops: its run lease expires.
    await persistence.stores.runs.update(turn.id, {
      leaseExpiresAt: Date.now() - 1,
    })
    const recovered = mockAdapter([() => text('recovered')])

    const next = await open(
      [],
      {
        durability: {
          recover: () => ({
            action: 'run',
            overrides: { adapter: recovered.adapter, reasoning: HIGH },
          }),
        },
      },
      { persistence },
    )

    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls).toHaveLength(0)
    expect(recovered.calls).toHaveLength(1)
    expect(recovered.calls[0].reasoning).toEqual(HIGH)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})

describe('turn overrides: plugin adapter picker', () => {
  it('gives the picker the turn, and the turn adapter wins over its pick', async () => {
    type PickerTurn = Parameters<NonNullable<PluginContributions['adapter']>>[0]
    const seen: Array<PickerTurn> = []
    const picked = mockAdapter([() => text('picked')])
    const turnModel = mockAdapter([() => text('turn')])
    const picker = definePlugin({
      name: 'test/picker',
      setup: () => ({
        adapter: (turn) => {
          seen.push(turn)
          return picked.adapter
        },
      }),
    })
    const { host, session, calls } = await open([], {
      plugins: () => [picker],
    })
    const overrides = { adapter: turnModel.adapter }

    const turn = session.prompt('go', { inputId: 'in-7', overrides })

    expect(await turn).toEqual({ text: 'turn' })
    expect(seen).toEqual([
      { operationId: turn.id, inputId: 'in-7', message: 'go', overrides },
    ])
    expect(picked.calls).toHaveLength(0)
    expect(calls).toHaveLength(0)
    await host.close()
  })
})
