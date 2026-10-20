import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { readInterruptBinding, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
  harnessAgent,
} from '../src'
import { createHarnessHandler } from '../src/server'
import {
  after,
  appendToLog,
  gate,
  mockAdapter,
  storedRun,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { Interrupt } from '@tanstack/ai'
import type { FakeResponse } from '@tanstack/ai/testing'
import type { AnyHarness } from '../src'

type Chunk = {
  type: string
  runId?: string
  parentRunId?: string
  name?: string
  value?: any
  delta?: string
  outcome?: { type: string; interrupts?: Array<Interrupt> }
}

const deployed: Array<string> = []
const deploy = toolDefinition({
  name: 'deploy',
  description: 'Deploy. Needs approval.',
  needsApproval: true,
  inputSchema: z.object({ env: z.string() }),
}).server(async ({ env }) => {
  deployed.push(env)
  return { ok: true }
})

const user = { id: 'user-1' }

/** A run that another host wrote to the log of thread `t-1`. */
const STORED_RUN = {
  runId: 'run-x',
  threadId: 't-1',
  status: 'completed',
  startedAt: 1,
} as const

/** A persistence whose log of `t-1` has {@link STORED_RUN} already. */
async function withStoredRun() {
  const persistence = memoryPersistence()
  await appendToLog(persistence.stores.log, { threadId: 't-1' }, [
    { type: 'harness.run', run: STORED_RUN },
  ])
  const stored = () =>
    storedRun(persistence.stores.log, { threadId: 't-1' }, 'run-x')
  return { persistence, stored }
}

/** A handler for `user`. `isAllowed` decides each action. */
function setup(
  harness: AnyHarness,
  authorize: () => boolean = () => true,
  persistence = memoryPersistence(),
) {
  const host = createHarnessHost({
    persistence,
    access: { getUser: () => user, rules: { isAllowed: authorize } },
  })
  const handler = createHarnessHandler({ host, harness })
  const call = (path: string, body?: object) =>
    handler(
      new Request(`http://h.test/api/${path}`, {
        ...(body
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      }),
    )
  const get = (path: string, headers: Record<string, string>) =>
    handler(new Request(`http://h.test/api/${path}`, { headers }))
  const run = (body: object) =>
    call('run', {
      threadId: 't-1',
      messages: [],
      tools: [],
      context: [],
      ...body,
    })
  return { host, call, get, run }
}

/** The `data` of each SSE event of `body`. Each event also has its cursor as `id`. */
const sse = (body: string): Array<Chunk> =>
  body.split('\n\n').flatMap((block) => {
    const data = block.split('\n').find((line) => line.startsWith('data: '))
    return data ? [JSON.parse(data.slice('data: '.length))] : []
  })

function approvalHarness(responses: Array<FakeResponse>) {
  const fake = fakeText()
  fake.setResponses(responses)
  return defineHarness({
    name: 'test/run-route',
    adapter: fake,
    tools: [deploy],
  })
}

describe('POST run', () => {
  it('runs the turn as the request runId, so a client can resolve its interrupt', async () => {
    deployed.length = 0
    const { host, run } = setup(
      approvalHarness([
        { toolCalls: [{ name: 'deploy', input: { env: 'prod' } }] },
        { text: 'Deployed.' },
      ]),
    )
    const first = sse(
      await (
        await run({
          runId: 'run-a',
          messages: [{ id: 'm-1', role: 'user', content: 'Deploy.' }],
        })
      ).text(),
    )
    expect(first.find((chunk) => chunk.type === 'RUN_STARTED')?.runId).toBe(
      'run-a',
    )
    const finished = first.find((chunk) => chunk.type === 'RUN_FINISHED')
    const interrupt = finished?.outcome?.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for the approval.')
    // ChatClient matches the interrupt against the runId it sent.
    expect(readInterruptBinding(interrupt)?.interruptedRunId).toBe('run-a')

    const second = await run({
      runId: 'run-b',
      parentRunId: 'run-a',
      resume: [
        {
          interruptId: interrupt.id,
          status: 'resolved',
          payload: { approved: true },
        },
      ],
    })
    expect(second.status).toBe(200)
    const resumed = sse(await second.text())
    expect(resumed.find((chunk) => chunk.type === 'RUN_STARTED')).toMatchObject(
      { runId: 'run-b', parentRunId: 'run-a' },
    )
    expect(resumed.some((chunk) => chunk.type === 'TOOL_CALL_RESULT')).toBe(
      true,
    )
    expect(deployed).toEqual(['prod'])
    await host.close()
  })

  it('streams the parent run to its end when a resume answers a wait of a harnessAgent child', async () => {
    deployed.length = 0
    const child = defineHarness({
      name: 'test/deploy-child',
      adapter: mockAdapter([
        () => toolCall('deploy', { env: 'prod' }),
        () => text('Deployed.'),
      ]).adapter,
      tools: [deploy],
    })
    const agent = harnessAgent(child)
    const harness = defineHarness({
      name: 'test/run-route',
      adapter: mockAdapter([
        () => toolCall(agent.name, { prompt: 'Deploy.' }),
        () => text('All done.'),
      ]).adapter,
      subagents: { agents: [agent] },
    })
    const { host, run } = setup(harness)
    // The turn waits for the child, so this stream ends only with the turn.
    const first = run({
      runId: 'run-a',
      messages: [{ id: 'm-1', role: 'user', content: 'Deploy.' }],
    })
    const session = await host.open(harness, {
      threadId: 't-1',
      user,
    })
    await vi.waitFor(
      () => expect(session.snapshot().pendingWaits).toHaveLength(1),
      { timeout: 5_000 },
    )
    const [wait] = session.snapshot().pendingWaits

    const second = await run({
      runId: 'run-b',
      resume: [
        { interruptId: wait?.waitId ?? '', status: 'resolved', payload: true },
      ],
    })
    expect(second.status).toBe(200)
    const resumed = sse(await second.text())
    expect(resumed.some((chunk) => chunk.delta === 'All done.')).toBe(true)
    expect(deployed).toEqual(['prod'])
    expect(await (await first).text()).toContain('All done.')
    await host.close()
  })

  it('runs a repeated request with the same runId once, and refuses that runId for another message', async () => {
    const { adapter, calls } = mockAdapter([() => text('hello')])
    const { host, run } = setup(
      defineHarness({ name: 'test/run-route', adapter }),
    )
    const body = {
      runId: 'run-a',
      messages: [{ id: 'm-1', role: 'user', content: 'Hi.' }],
    }
    expect(await (await run(body)).text()).toContain('"delta":"hello"')
    expect(await (await run(body)).text()).toContain('"delta":"hello"')
    expect(calls).toHaveLength(1)

    const other = await run({
      runId: 'run-a',
      messages: [{ id: 'm-2', role: 'user', content: 'Something else.' }],
    })
    expect(other.status).toBe(409)
    expect(await other.json()).toEqual({ error: 'conflict' })
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('refuses a runId that a run in the log already has, and leaves that run alone', async () => {
    const { persistence, stored } = await withStoredRun()
    const { adapter, calls } = mockAdapter([() => text('hello')])
    const { host, run } = setup(
      defineHarness({ name: 'test/run-route', adapter }),
      undefined,
      persistence,
    )

    const response = await run({
      runId: 'run-x',
      messages: [{ id: 'm-1', role: 'user', content: 'Hi.' }],
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'conflict' })
    expect(calls).toHaveLength(0)
    expect(await stored()).toEqual(STORED_RUN)
    await host.close()
  })

  it('refuses a resume whose runId a run in the log already has, and keeps the interrupt', async () => {
    deployed.length = 0
    const { persistence, stored } = await withStoredRun()
    const { host, run } = setup(
      approvalHarness([
        { toolCalls: [{ name: 'deploy', input: { env: 'prod' } }] },
        { text: 'Deployed.' },
      ]),
      undefined,
      persistence,
    )
    const first = sse(
      await (
        await run({
          runId: 'run-a',
          messages: [{ id: 'm-1', role: 'user', content: 'Deploy.' }],
        })
      ).text(),
    )
    const interrupt = first.find((chunk) => chunk.type === 'RUN_FINISHED')
      ?.outcome?.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for the approval.')

    const resume = [
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ]
    const refused = await run({ runId: 'run-x', resume })
    expect(refused.status).toBe(409)
    expect(await stored()).toEqual(STORED_RUN)
    expect(deployed).toEqual([])
    const session = await host.open(approvalHarness([]), {
      threadId: 't-1',
      user,
    })
    expect(turnInterrupts(session.snapshot())).toHaveLength(1)
    await host.close()
  })

  it("refuses another person's request with the same runId, and gives them no stream", async () => {
    const { adapter, calls } = mockAdapter([() => text('hello')])
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }) => ({
          id: request.headers.get('x-user') ?? '',
        }),
        rules: { isAllowed: () => true },
      },
    })
    const handler = createHarnessHandler({
      host,
      harness: defineHarness({ name: 'test/run-route', adapter }),
    })
    const post = (user: string) =>
      handler(
        new Request('http://h.test/api/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-user': user },
          body: JSON.stringify({
            threadId: 't-1',
            runId: 'r1',
            messages: [{ id: 'm-1', role: 'user', content: 'Hi.' }],
            tools: [],
            context: [],
          }),
        }),
      )

    expect(await (await post('alice')).text()).toContain('"delta":"hello"')
    const bobs = await post('bob')
    expect(bobs.status).toBe(409)
    expect(await bobs.json()).toEqual({ error: 'conflict' })
    // Alice's retry is still her own input.
    expect(await (await post('alice')).text()).toContain('"delta":"hello"')
    expect(calls).toHaveLength(1)
    await host.close()
  })
})

describe('GET run', () => {
  it('answers the hydrate request of a ChatClient with the transcript and the pending interrupts', async () => {
    const { host, run, call } = setup(
      approvalHarness([
        {
          text: 'Deploying.',
          toolCalls: [{ name: 'deploy', input: { env: 'prod' } }],
        },
      ]),
    )
    const first = sse(
      await (
        await run({
          runId: 'run-a',
          messages: [{ id: 'm-1', role: 'user', content: 'Deploy.' }],
        })
      ).text(),
    )
    const interruptId = first.find((chunk) => chunk.type === 'RUN_FINISHED')
      ?.outcome?.interrupts?.[0]?.id

    const response = await call('run?threadId=t-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.messages.map((message: any) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(body.activeRun).toBeNull()
    expect(body.interrupts).toMatchObject({
      runId: 'run-a',
      pending: [{ id: interruptId }],
    })
    await host.close()
  })

  it('answers an empty thread with no messages and no interrupts', async () => {
    const { adapter } = mockAdapter([])
    const { host, call } = setup(
      defineHarness({ name: 'test/run-route', adapter }),
    )
    expect(await (await call('run?threadId=t-1')).json()).toEqual({
      messages: [],
      activeRun: null,
      interrupts: null,
    })
    await host.close()
  })

  it('refuses a thread that authorize refuses, and hydrates a new thread with nothing and no entry', async () => {
    const { adapter } = mockAdapter([])
    const harness = defineHarness({ name: 'test/run-route', adapter })
    const { host, call } = setup(harness, () => false)
    expect(await (await call('run?threadId=t-1')).json()).toEqual({
      messages: [],
      activeRun: null,
      interrupts: null,
    })
    expect(await host.sessions.get({ threadId: 't-1', user })).toBeUndefined()
    // The user who creates a thread needs no check.
    await host.open(harness, { threadId: 't-1', user })
    expect((await call('run?threadId=t-1')).status).toBe(403)
    await host.close()
  })
})

describe('questions', () => {
  it('sends a question that a tool asks on the POST run stream of its turn', async () => {
    const probe = toolDefinition({
      name: 'probe',
      description: 'Asks a question.',
      inputSchema: z.object({}),
    })
    const plugin = definePlugin({
      name: 'test/probe',
      setup: () => ({
        tools: [
          durableTool(probe, async (_args, { step }) => ({
            name: await step.ask({
              name: 'name',
              message: 'What is your name?',
              schema: z.string(),
            }),
          })),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('probe', {}),
      () => text('Done.'),
    ])
    const { host, run, call } = setup(
      defineHarness({
        name: 'test/run-route',
        adapter,
        plugins: () => [plugin],
      }),
    )
    const response = await run({
      runId: 'run-a',
      messages: [{ id: 'm-1', role: 'user', content: 'Go.' }],
    })
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader()
    let streamed = ''
    while (!streamed.includes('harness.question')) {
      const { value, done } = await reader.read()
      if (done) throw new Error('The stream ended before the question.')
      streamed += value
    }
    const question = sse(`${streamed}\n\n`).find(
      (chunk) => chunk.name === 'harness.question',
    )
    expect(question?.value).toMatchObject({ message: 'What is your name?' })

    const receipt = await call('control', {
      threadId: 't-1',
      input: {
        op: 'answer',
        questionId: question?.value.questionId,
        value: 'Otto',
      },
    })
    expect(await receipt.json()).toMatchObject({ status: 'accepted' })
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      streamed += value
    }
    expect(streamed).toContain('Otto')
    expect(streamed).toContain('harness.question.answered')
    expect(streamed).toContain('harness.operation.finished')

    // The session stream has the question once.
    const session = await host.open(
      defineHarness({ name: 'test/run-route', adapter }),
      {
        threadId: 't-1',
        user,
      },
    )
    let questions = 0
    for await (const entry of session.events({
      signal: AbortSignal.timeout(200),
    })) {
      if (
        entry.event.type === 'CUSTOM' &&
        entry.event.name === 'harness.question'
      )
        questions += 1
    }
    expect(questions).toBe(1)
    await host.close()
  })
})

describe('join a running turn', () => {
  /** A turn whose tool waits for an answer, so it stays running. */
  function askingHarness() {
    const probe = toolDefinition({
      name: 'probe',
      description: 'Asks a question.',
      inputSchema: z.object({}),
    })
    const plugin = definePlugin({
      name: 'test/probe',
      setup: () => ({
        tools: [
          durableTool(probe, async (_args, { step }) => ({
            name: await step.ask({
              name: 'name',
              message: 'Name?',
              schema: z.string(),
            }),
          })),
        ],
      }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('probe', {}),
      () => text('Done.'),
    ])
    return defineHarness({
      name: 'test/run-route',
      adapter,
      plugins: () => [plugin],
    })
  }

  /** SSE events with their `id:` lines. */
  const withIds = (body: string) =>
    body
      .split('\n\n')
      .filter((block) => block.includes('data: '))
      .map((block) => {
        const id = /^id: (.*)$/m.exec(block)?.[1]
        const data = /^data: (.*)$/m.exec(block)?.[1] ?? 'null'
        const chunk: Chunk = JSON.parse(data)
        return { id, chunk }
      })

  /** Read `response` until `name` arrives. Returns the reader and the text so far. */
  async function readUntil(response: Response, name: string) {
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader()
    let text = ''
    while (!text.includes(name)) {
      const { value, done } = await reader.read()
      if (done) throw new Error(`The stream ended before ${name}.`)
      text += value
    }
    const rest = async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return text
        text += value
      }
    }
    return { text, rest }
  }

  /** Start a turn as `run-a` and wait until its tool asks. */
  async function startAsking(authorize?: () => boolean) {
    const route = setup(askingHarness(), authorize)
    const posted = await readUntil(
      await route.run({
        runId: 'run-a',
        messages: [{ id: 'm-1', role: 'user', content: 'Go.' }],
      }),
      'harness.question',
    )
    const questionId = sse(`${posted.text}\n\n`).find(
      (chunk) => chunk.name === 'harness.question',
    )?.value.questionId
    const answer = () =>
      route.call('control', {
        threadId: 't-1',
        input: { op: 'answer', questionId, value: 'Otto' },
      })
    return { ...route, posted, answer }
  }

  it('shows the running turn as activeRun in the hydrate answer', async () => {
    const { host, call, answer, posted } = await startAsking()
    const running = await (await call('run?threadId=t-1')).json()
    expect(running.activeRun).toEqual({ runId: 'run-a' })

    await answer()
    await posted.rest()
    const ended = await (await call('run?threadId=t-1')).json()
    expect(ended.activeRun).toBeNull()
    await host.close()
  })

  it('streams the turn from its start to its end, as POST run does', async () => {
    const { host, call, answer, posted } = await startAsking()
    const joined = await call('run?runId=run-a&offset=-1')
    expect(joined.status).toBe(200)
    expect(joined.headers.get('content-type')).toContain('text/event-stream')
    const reading = await readUntil(joined, 'harness.question')

    await answer()
    const [postedText, joinedText] = await Promise.all([
      posted.rest(),
      reading.rest(),
    ])
    const events = withIds(joinedText)
    expect(events.every((event) => event.id !== undefined)).toBe(true)
    expect(events.some((event) => event.chunk.type === 'RUN_STARTED')).toBe(
      true,
    )
    expect(joinedText).toContain('Done.')
    expect(joinedText).toContain('harness.operation.finished')
    // The same events as the stream that started the turn.
    expect(events.map((event) => event.chunk)).toEqual(sse(postedText))
    await host.close()
  })

  it('resumes after Last-Event-ID with no repeated event, also after the turn ended', async () => {
    const { host, call, get, answer, posted } = await startAsking()
    await answer()
    await posted.rest()
    const all = withIds(await (await call('run?runId=run-a&offset=-1')).text())
    expect(all.at(-1)?.chunk.name).toBe('harness.operation.finished')
    const cut = all[2]?.id
    if (cut === undefined) throw new Error('Too few events.')

    const resumed = await get('run?offset=-1', {
      'X-Run-Id': 'run-a',
      'Last-Event-ID': cut,
    })
    expect(withIds(await resumed.text())).toEqual(all.slice(3))
    await host.close()
  })

  it('replays the messages snapshot of a run that paused at an interrupt', async () => {
    const { host, call, run } = setup(
      approvalHarness([
        { toolCalls: [{ name: 'deploy', input: { env: 'prod' } }] },
      ]),
    )
    const posted = sse(
      await (
        await run({
          runId: 'run-a',
          messages: [{ id: 'm-1', role: 'user', content: 'Deploy.' }],
        })
      ).text(),
    )
    expect(
      posted.find((chunk) => chunk.type === 'RUN_FINISHED')?.outcome?.type,
    ).toBe('interrupt')

    // A rejoin reads the log. ai-client rebuilds the paused run from the
    // snapshot, so the log must keep it, before the interrupt.
    const joined = withIds(
      await (await call('run?runId=run-a&threadId=t-1&offset=-1')).text(),
    ).map((event) => event.chunk.type)
    const snapshotAt = joined.indexOf('MESSAGES_SNAPSHOT')
    expect(snapshotAt).toBeGreaterThan(-1)
    expect(snapshotAt).toBeLessThan(joined.lastIndexOf('RUN_FINISHED'))
    await host.close()
  })

  it('refuses a join of a thread the user may not use', async () => {
    let allowed = true
    const { host, call, answer, posted } = await startAsking(() => allowed)
    allowed = false
    expect((await call('run?runId=run-a')).status).toBe(403)
    allowed = true
    await answer()
    await posted.rest()
    await host.close()
  })

  it('answers 404 for a run that the log of the thread does not have', async () => {
    const { adapter } = mockAdapter([])
    const { host, call } = setup(
      defineHarness({ name: 'test/run-route', adapter }),
    )
    const response = await call('run?runId=nope&threadId=t-1&offset=-1')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unknown run' })
    await host.close()
  })

  it('answers 400 for a join with no threadId of a run this host does not run', async () => {
    const { adapter } = mockAdapter([])
    const { host, call } = setup(
      defineHarness({ name: 'test/run-route', adapter }),
    )
    const response = await call('run?runId=nope&offset=-1')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'threadId is required to join a run of another instance',
    })
    await host.close()
  })
})

describe('snapshot', () => {
  it('gives each running operation the cursor its events start after', async () => {
    const held = gate()
    const { adapter } = mockAdapter([
      () => text('Warm.'),
      after(held.opened, 'First.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: 'test/run-route', adapter }),
      {
        threadId: 't-1',
      },
    )
    // Events of another turn come before this one.
    await session.send('Warm up.')
    const turn = session.send('Start.')
    await turn.receipt
    const [active] = session.snapshot().activeOperations
    expect(active?.id).toBe(turn.id)
    const startedCursor = active?.startedCursor
    if (startedCursor === undefined) throw new Error('No start cursor.')

    held.open()
    await turn
    const ofTurn = async (from?: string) => {
      const ids: Array<string> = []
      for await (const entry of session.events({
        ...(from ? { from } : {}),
        signal: AbortSignal.timeout(200),
      })) {
        if (entry.operationId === turn.id) ids.push(entry.cursor)
      }
      return ids
    }
    const all = await ofTurn()
    expect(all.length).toBeGreaterThan(0)
    expect(await ofTurn(startedCursor)).toEqual(all)
    await host.close()
  })
})
