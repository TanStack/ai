import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  UNOWNED_EPOCH,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
} from '../src'
import { tenantStores } from '../src/tenant-stores'
import { mockAdapter, text, toolCall } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { Reply } from './helpers'

const THREAD = 't1'
const NAME = 'test/tenant-keys'
const acme = { id: 'a', tenantId: 'acme' }
const globex = { id: 'b', tenantId: 'globex' }
/** The store key of `THREAD` in the tenant of `acme`. */
const ACME_THREAD = logIdOf({ tenantId: acme.tenantId, logId: THREAD })
const PROMPT = { op: 'prompt', message: 'go', busy: 'queue' }

/** A plugin with a setting, and a counter in its state. */
const counter = definePlugin({
  name: 'test/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      config: { tone: configOption.text({ default: 'plain' }) },
      commands: {
        bump: defineCommand({
          description: 'Add one',
          run: async () =>
            (await state.update((value) => ({ count: value.count + 1 }))).count,
        }),
      },
    }
  },
})

const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy. Needs approval.',
  needsApproval: true,
  inputSchema: z.object({ env: z.string() }),
}).server(async () => ({ ok: true }))

function harnessWith(replies: Array<Reply> = []) {
  const model = mockAdapter(replies)
  const harness = defineHarness({
    name: NAME,
    adapter: model.adapter,
    tools: [deploy],
    plugins: () => [counter],
  })
  return { harness, calls: model.calls }
}

/** The role and content of each message. */
const contents = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map(({ role, content }) => ({ role, content }))

/** A host with `stores.log`. */
function durableHost() {
  const { runs, interrupts, metadata, workClaims } = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, runs, interrupts, metadata, workClaims },
  }
  return {
    persistence,
    /** A prompt that a host logged for `key` just before it stopped. */
    seedInput: (key: string) =>
      log.append({
        logId: key,
        seq: 1,
        epoch: UNOWNED_EPOCH,
        records: [
          { type: 'harness.input', inputId: 'in-1', input: PROMPT, at: 1 },
        ],
      }),
  }
}

describe('one thread id in two tenants', () => {
  it('keeps the settings and the config of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith()
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, principal: acme })
    await a.configure({ settings: { instructions: 'Answer as acme.' } })
    await a.setConfig({ key: 'tone', value: 'warm' })

    const b = await host.open(harness, { threadId: THREAD, principal: globex })
    expect(b.settings()).toEqual({})
    expect(b.config().tone?.value).toBe('plain')
    await host.close()

    // A new host reads the values of acme back.
    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, {
      threadId: THREAD,
      principal: acme,
    })
    expect(reopened.settings()).toEqual({ instructions: 'Answer as acme.' })
    expect(reopened.config().tone?.value).toBe('warm')
    await again.close()
  })

  it('keeps the plugin state of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith()
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, principal: acme })
    expect(await a.command({ name: 'bump' })).toBe(1)

    const b = await host.open(harness, { threadId: THREAD, principal: globex })
    expect(b.snapshot().plugins).toEqual({ 'test/counter': { count: 0 } })
    expect(await b.command({ name: 'bump' })).toBe(1)
    expect(await a.command({ name: 'bump' })).toBe(2)
    await host.close()
  })

  it('keeps the transcript of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith([() => text('Hello, acme.')])
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, principal: acme })
    expect((await a.send('Hi.')).text).toBe('Hello, acme.')

    const b = await host.open(harness, { threadId: THREAD, principal: globex })
    expect(await b.transcript()).toEqual([])
    expect(contents(await a.transcript())).toEqual([
      { role: 'user', content: 'Hi.' },
      { role: 'assistant', content: 'Hello, acme.' },
    ])
    await host.close()
  })

  it('keeps a pending interrupt of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith([() => toolCall('deploy', { env: 'prod' })])
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, principal: acme })
    expect((await a.send('Deploy.')).interrupts).toHaveLength(1)

    const b = await host.open(harness, { threadId: THREAD, principal: globex })
    expect(b.snapshot().pendingInterrupts).toEqual([])
    await host.close()

    // A new host finds the interrupt of acme again.
    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, {
      threadId: THREAD,
      principal: acme,
    })
    expect(reopened.snapshot().pendingInterrupts).toHaveLength(1)
    await again.close()
  })

  it('refuses a client run id that the other tenant used', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith([() => text('Hello, acme.')])
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, principal: acme })
    expect((await a.send('Hi.', { runId: 'run-1' })).text).toBe('Hello, acme.')

    const b = await host.open(harness, { threadId: THREAD, principal: globex })
    expect(await b.send('Hi.', { runId: 'run-1' }).receipt).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    await host.close()
  })

  it('resumes a claimed thread in the tenant of its claim', async () => {
    const { persistence, seedInput } = durableHost()
    await seedInput(ACME_THREAD)
    await persistence.stores.workClaims.claim({
      threadId: ACME_THREAD,
      harness: NAME,
      ownerId: 'host-gone',
      until: Date.now() - 1_000,
    })
    const { harness, calls } = harnessWith([() => text('Ran.')])
    const host = createHarnessHost({ persistence })

    expect(await host.resumePending({ harnesses: [harness] })).toEqual([
      { threadId: THREAD, harness: NAME },
    ])
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.waitFor(async () => {
      const a = await host.open(harness, { threadId: THREAD, principal: acme })
      expect(contents(await a.transcript())).toEqual([
        { role: 'user', content: 'go' },
        { role: 'assistant', content: 'Ran.' },
      ])
    })
    const other = await host.open(harness, { threadId: THREAD })
    expect(await other.transcript()).toEqual([])
    await host.close()
  })
})

describe('tenantStores', () => {
  /** The run and interrupt stores of one memory persistence, seen by two tenants. */
  function twoTenants() {
    const { runs, interrupts } = memoryPersistence().stores
    return {
      runs,
      acme: tenantStores({ runs, interrupts }, acme.tenantId),
      globex: tenantStores({ runs, interrupts }, globex.tenantId),
    }
  }

  it('keeps each record under its store key, and hides it from the other tenant', async () => {
    const { runs, acme: mine, globex: theirs } = twoTenants()
    await mine.runs?.createOrResume({
      runId: 'run-1',
      threadId: THREAD,
      startedAt: 1,
    })
    await mine.interrupts?.create({
      interruptId: 'i-1',
      runId: 'run-1',
      threadId: THREAD,
      requestedAt: 1,
      payload: {},
    })

    expect(await runs.get('run-1')).toMatchObject({ threadId: ACME_THREAD })
    expect(await mine.runs?.get('run-1')).toMatchObject({ threadId: THREAD })
    expect(await mine.interrupts?.listPending(THREAD)).toMatchObject([
      { interruptId: 'i-1', threadId: THREAD },
    ])
    expect(await theirs.runs?.get('run-1')).toBeNull()
    expect(await theirs.runs?.listByThread?.(THREAD)).toEqual([])
    expect(await theirs.interrupts?.get('i-1')).toBeNull()
    expect(await theirs.interrupts?.listByRun('run-1')).toEqual([])
  })

  it('refuses to go on with a run id of the other tenant', async () => {
    const { acme: mine, globex: theirs } = twoTenants()
    await mine.runs?.createOrResume({
      runId: 'run-1',
      threadId: THREAD,
      startedAt: 1,
    })

    await expect(
      theirs.runs?.createOrResume({
        runId: 'run-1',
        threadId: THREAD,
        startedAt: 2,
      }),
    ).rejects.toThrow('Run run-1 is in another tenant.')
  })
})
