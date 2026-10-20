import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  NO_OWNER_EPOCH,
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
import { mockAdapter, text, toolCall, turnInterrupts } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
  const { metadata } = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, metadata },
  }
  return {
    persistence,
    /** A prompt that a host logged for `key` just before it stopped. */
    seedInput: (key: string) =>
      log.append({
        logId: key,
        seq: 1,
        epoch: NO_OWNER_EPOCH,
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
    const a = await host.open(harness, { threadId: THREAD, user: acme })
    await a.updateThreadSettings({
      settings: { instructions: 'Answer as acme.' },
    })
    await a.setPluginSetting({ key: 'tone', value: 'warm' })

    const b = await host.open(harness, { threadId: THREAD, user: globex })
    expect(b.threadSettings()).toEqual({})
    expect(b.pluginSettings().tone?.value).toBe('plain')
    await host.close()

    // A new host reads the values of acme back.
    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, {
      threadId: THREAD,
      user: acme,
    })
    expect(reopened.threadSettings()).toEqual({
      instructions: 'Answer as acme.',
    })
    expect(reopened.pluginSettings().tone?.value).toBe('warm')
    await again.close()
  })

  it('keeps the plugin state of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith()
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, user: acme })
    expect(await a.runCommand({ name: 'bump' })).toBe(1)

    const b = await host.open(harness, { threadId: THREAD, user: globex })
    expect(b.snapshot().plugins).toEqual({ 'test/counter': { count: 0 } })
    expect(await b.runCommand({ name: 'bump' })).toBe(1)
    expect(await a.runCommand({ name: 'bump' })).toBe(2)
    await host.close()
  })

  it('keeps the transcript of one tenant from the other', async () => {
    const { persistence } = durableHost()
    const { harness } = harnessWith([() => text('Hello, acme.')])
    const host = createHarnessHost({ persistence })
    const a = await host.open(harness, { threadId: THREAD, user: acme })
    expect((await a.send('Hi.')).text).toBe('Hello, acme.')

    const b = await host.open(harness, { threadId: THREAD, user: globex })
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
    const a = await host.open(harness, { threadId: THREAD, user: acme })
    expect((await a.send('Deploy.')).interrupts).toHaveLength(1)

    const b = await host.open(harness, { threadId: THREAD, user: globex })
    expect(turnInterrupts(b.snapshot())).toEqual([])
    await host.close()

    // A new host finds the interrupt of acme again.
    const again = createHarnessHost({ persistence })
    const reopened = await again.open(harness, {
      threadId: THREAD,
      user: acme,
    })
    expect(turnInterrupts(reopened.snapshot())).toHaveLength(1)
    await again.close()
  })

  it('resumes a thread in the tenant of its log', async () => {
    const { persistence, seedInput } = durableHost()
    await seedInput(ACME_THREAD)
    // The host that logged the input stopped while it owned the log.
    await persistence.stores.log.acquireOwnership({
      logId: ACME_THREAD,
      harness: NAME,
      ownerId: 'host-gone',
      ttlMs: 1,
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const { harness, calls } = harnessWith([() => text('Ran.')])
    const host = createHarnessHost({ persistence })

    expect(await host.resumePending({ harnesses: [harness] })).toEqual([
      { threadId: THREAD, harness: NAME, tenantId: acme.tenantId },
    ])
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(async () => {
      const a = await host.open(harness, { threadId: THREAD, user: acme })
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
