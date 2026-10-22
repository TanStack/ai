import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  InputRejectedError,
  createHarnessHost,
  defineHarness,
  logIdOf,
  membersOnly,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { mockAdapter, text, toolCall } from './helpers'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { AcceptInput, HarnessInput, HarnessRunContext } from '../src'

const THREAD = 't1'
const ann = { id: 'ann', tenantId: 'acme' }

/** A tool that keeps the context of each call, without the run. */
function planTool() {
  const seen: Array<unknown> = []
  const tool = toolDefinition({
    name: 'plan',
    description: "The caller's plan.",
    inputSchema: z.object({}),
  }).server<HarnessRunContext>((_input, toolContext) => {
    const { run: _run, ...context } = toolContext.context
    seen.push(context)
    return Promise.resolve('ok')
  })
  return { tool, seen }
}

/** The `harness.input` records of `THREAD`. */
async function loggedInputs(
  persistence: ReturnType<typeof memoryPersistence>,
  tenantId?: string,
) {
  const entries = await persistence.stores.log.read({
    logId: logIdOf({ tenantId, logId: THREAD }),
  })
  return entries
    .map((entry): LogRecord => entry.record)
    .filter((record) => record.type === 'harness.input')
    .map((record) => record['input'])
}

/** The server's own plan wins over the plan that a client sends. */
const serverPlan: AcceptInput = (input) =>
  input.op === 'prompt' ? { ...input, context: { plan: 'free' } } : input

describe('acceptInput', () => {
  it('changes an input before the log keeps it, and the turn uses the change', async () => {
    const { tool, seen } = planTool()
    const { adapter } = mockAdapter([
      () => toolCall('plan', {}),
      () => text('Done.'),
    ])
    const persistence = memoryPersistence()
    const acceptInput = vi.fn(serverPlan)
    const host = createHarnessHost({ persistence, acceptInput })
    const harness = defineHarness({
      name: 'test/accept',
      adapter,
      tools: [tool],
    })
    const session = await host.open(harness, { threadId: THREAD })

    await session.send('Which plan?', {
      context: { plan: 'enterprise', role: 'admin' },
    })

    expect(acceptInput).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'prompt', message: 'Which plan?' }),
      { user: undefined, threadId: THREAD },
    )
    expect(seen).toEqual([{ plan: 'free' }])
    expect(await loggedInputs(persistence)).toEqual([
      expect.objectContaining({ op: 'prompt', context: { plan: 'free' } }),
    ])
    await host.close()
  })

  it('changes an input that is not a turn: the settings that apply are the changed ones', async () => {
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      acceptInput: (input) =>
        input.op === 'configure'
          ? { ...input, settings: { ...input.settings, reasoning: 'low' } }
          : input,
    })
    const harness = defineHarness({
      name: 'test/accept',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const session = await host.open(harness, { threadId: THREAD })

    await session.updateThreadSettings({ settings: { instructions: 'Hi.' } })

    expect(session.threadSettings()).toEqual({
      instructions: 'Hi.',
      reasoning: 'low',
    })
    await host.close()
  })

  it('refuses an input with a rejected receipt, and the log keeps nothing', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const persistence = memoryPersistence()
    const host = createHarnessHost({
      persistence,
      acceptInput: () => ({ refuse: 'over_quota' }),
    })
    const harness = defineHarness({ name: 'test/accept', adapter })
    const session = await host.open(harness, { threadId: THREAD })

    const turn = session.send('Hi.')
    expect(await turn.receipt).toMatchObject({
      status: 'rejected',
      reason: 'over_quota',
    })
    await expect(turn).rejects.toBeInstanceOf(InputRejectedError)
    expect(
      await session.updateThreadSettings({ settings: { reasoning: 'low' } }),
    ).toMatchObject({ status: 'rejected', reason: 'over_quota' })
    expect(session.threadSettings()).toEqual({})
    expect(calls).toHaveLength(0)
    expect(await loggedInputs(persistence)).toEqual([])
    await host.close()
  })

  it('treats a retry of a changed input as the same input', async () => {
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      acceptInput: serverPlan,
    })
    const harness = defineHarness({ name: 'test/accept', adapter })
    const session = await host.open(harness, { threadId: THREAD })
    const sent = { inputId: 'in-1', context: { plan: 'enterprise' } }

    const first = await session.send('Hi.', sent)
    const again = session.send('Hi.', sent)

    expect((await again.receipt).status).not.toBe('rejected')
    expect(await again).toEqual(first)
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('refuses an input whose op the hook changed', async () => {
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      acceptInput: (input): HarnessInput =>
        input.op === 'prompt' ? { op: 'reset' } : input,
    })
    const harness = defineHarness({
      name: 'test/accept',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const session = await host.open(harness, { threadId: THREAD })

    expect(await session.send('Hi.').receipt).toMatchObject({
      status: 'rejected',
      reason: 'acceptInput changed the op of the input from prompt to reset.',
    })
    await host.close()
  })

  it('runs after the access check, with the user of the input', async () => {
    const acceptInput = vi.fn(serverPlan)
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: () => null,
        rules: { isAllowed: ({ action }) => action !== 'configure' },
      },
      acceptInput,
    })
    const harness = defineHarness({
      name: 'test/accept',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const session = await host.open(harness, { threadId: THREAD, user: ann })

    await expect(
      session.updateThreadSettings({ settings: { reasoning: 'low' } }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(acceptInput).not.toHaveBeenCalled()
    await session.send('Hi.')
    expect(acceptInput).toHaveBeenCalledWith(expect.anything(), {
      user: ann,
      threadId: THREAD,
    })
    await host.close()
  })

  it('changes an input of host.submit before it goes to the owner', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence, acceptInput: serverPlan })
    const harness = defineHarness({
      name: 'test/accept',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const submit = (message: string) =>
      host.submit({
        harness,
        threadId: THREAD,
        input: { op: 'prompt', message, context: { plan: 'enterprise' } },
      })

    expect(await submit('Hi.')).toMatchObject({ status: 'queued' })
    const offers = await persistence.stores.log.listOfferedInputs({
      logId: logIdOf({ logId: THREAD }),
    })
    expect(offers.map((offer) => offer.record['input'])).toEqual([
      expect.objectContaining({ context: { plan: 'free' } }),
    ])
    await host.close()

    const refusing = createHarnessHost({
      persistence,
      acceptInput: () => ({ refuse: 'over_quota' }),
    })
    expect(
      await refusing.submit({
        harness,
        threadId: THREAD,
        input: { op: 'prompt', message: 'Hi.' },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'over_quota' })
    await refusing.close()
  })
})

describe('acceptInput behind createHarnessHandler', () => {
  function setup(acceptInput: AcceptInput) {
    const { tool, seen } = planTool()
    const harness = defineHarness({
      name: 'test/accept-http',
      adapter: mockAdapter([() => toolCall('plan', {}), () => text('Done.')])
        .adapter,
      tools: [tool],
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: () => ann, rules: membersOnly() },
      acceptInput,
    })
    const handler = createHarnessHandler({
      host,
      harness,
      media: { secret: 'a'.repeat(32) },
    })
    const post = (route: string, body: unknown) =>
      handler(
        new Request(`http://x/api/harness/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    return { host, seen, post }
  }

  it('gives the server tool the changed context of a POST control prompt', async () => {
    const acceptInput = vi.fn(serverPlan)
    const { host, seen, post } = setup(acceptInput)

    const response = await post('control', {
      threadId: THREAD,
      input: {
        op: 'prompt',
        message: 'Which plan?',
        context: { plan: 'enterprise', role: 'admin' },
      },
    })

    expect(response.status).toBe(200)
    await vi.waitFor(() => expect(seen).toEqual([{ plan: 'free' }]))
    expect(acceptInput).toHaveBeenCalledWith(expect.anything(), {
      user: ann,
      threadId: THREAD,
    })
    await host.close()
  })

  it('answers a refused POST control input with a rejected receipt, and a refused POST run with 409', async () => {
    const { host, post } = setup(() => ({ refuse: 'over_quota' }))

    const control = await post('control', {
      threadId: THREAD,
      input: { op: 'prompt', message: 'Hi.' },
    })
    expect(await control.json()).toMatchObject({
      status: 'rejected',
      reason: 'over_quota',
    })
    const run = await post('run', {
      threadId: THREAD,
      runId: 'run-1',
      messages: [{ id: 'm1', role: 'user', content: 'Hi.' }],
      tools: [],
      context: [],
      forwardedProps: { plan: 'enterprise' },
      state: {},
    })
    expect(run.status).toBe(409)
    expect(await run.json()).toEqual({ error: 'over_quota' })
    await host.close()
  })
})
