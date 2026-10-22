import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, defineInterrupt, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { permissions } from '../src/first-party'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware, AnyTool, StreamChunk } from '@tanstack/ai'
import type {
  AnyAgent,
  AnyHarness,
  HarnessRunContext,
  HarnessSession,
} from '../src'

async function open(harness: AnyHarness) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, {
    threadId: 't',
    user: { id: 'user-1' },
  })
  return { host, session }
}

/** A tool that writes a file, and the calls it got. */
function writeTool() {
  const execute = vi.fn(async () => 'written')
  const tool = toolDefinition({
    name: 'write_file',
    description: 'Write a file',
    inputSchema: z.object({ path: z.string() }),
  }).server(execute)
  return { tool, execute }
}

/** An agent whose model calls `tool` with `args`, then answers `answer`. */
function toolAgent(
  name: string,
  tool: AnyTool,
  args: Record<string, unknown>,
  answer = `${name} done`,
  extra: { middleware?: Array<AnyChatMiddleware> } = {},
) {
  const model = mockAdapter([
    () => toolCall(tool.name, args, `call_${name}`),
    () => text(answer),
  ])
  const agent = defineAgent({
    name,
    description: `The ${name} agent`,
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [tool], ...extra }),
  })
  return { agent, model }
}

/** A lead model that calls the agents `names` in one message, then answers. */
function leadCalling(...names: Array<string>) {
  const calls = names.map((name) =>
    toolCall(name, { prompt: `do ${name}` }, `lead_${name}`),
  )
  // One model message with every call: the start of the first, the tool
  // chunks of each, and the end of the first.
  const first = calls[0] ?? []
  const message: Array<StreamChunk> = [
    ...first.slice(0, 1),
    ...calls.flatMap((chunks) => chunks.slice(1, -1)),
    ...first.slice(-1),
  ]
  return mockAdapter([() => message, () => text('lead done')])
}

function leadHarness(
  lead: ReturnType<typeof mockAdapter>,
  agents: ReadonlyArray<AnyAgent>,
  extra: Partial<Parameters<typeof defineHarness>[0]> = {},
) {
  return defineHarness({
    name: 'test/subagent-waits',
    adapter: lead.adapter,
    subagents: { agents },
    plugins: () => [
      permissions({ rules: [{ tool: 'write_file', decision: 'ask' }] }),
    ],
    ...extra,
  })
}

/** Resolve every wait of the stopped turn with `answer`, and await the turn. */
async function resolveAll(
  session: HarnessSession,
  answer: (
    waitId: string,
  ) => { status: 'resolved'; payload: unknown } | { status: 'cancelled' },
) {
  const receipt = await session.resolve({
    resume: session.snapshot().pendingWaits.map(({ waitId }) => ({
      interruptId: waitId,
      ...answer(waitId),
    })),
  })
  return session.operation(receipt.operationId ?? '')
}

describe('a wait of an agent tool', () => {
  it('waits as a wait of the turn, and the agent goes on after the approval', async () => {
    const write = writeTool()
    const writer = toolAgent('writer', write.tool, { path: 'x.txt' })
    const lead = leadCalling('writer')
    const { host, session } = await open(leadHarness(lead, [writer.agent]))

    const stopped = await session.send('write it')
    const waits = session.snapshot().pendingWaits
    expect(stopped.interrupts).toHaveLength(1)
    expect(waits).toEqual([
      expect.objectContaining({
        kind: 'approval',
        turn: true,
        agent: 'writer',
        subagentRunId: expect.stringMatching(/^subagent-/),
      }),
    ])
    expect(write.execute).not.toHaveBeenCalled()

    const result = await resolveAll(session, () => ({
      status: 'resolved',
      payload: true,
    }))
    expect(result).toMatchObject({ text: 'lead done' })
    expect(write.execute).toHaveBeenCalledTimes(1)
    // The agent went on: its model got its earlier call, not a new start.
    expect(writer.model.calls).toHaveLength(2)
    // The second call starts with the messages of the first, so the prompt
    // cache of the agent holds.
    const [firstCall, secondCall] = writer.model.calls
    expect(
      JSON.stringify(secondCall.messages.slice(0, firstCall.messages.length)),
    ).toBe(JSON.stringify(firstCall.messages))
    expect(JSON.stringify(lead.calls[1].messages)).toContain('writer done')
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('gives the agent the rejection, and the tool does not run', async () => {
    const write = writeTool()
    const writer = toolAgent('writer', write.tool, { path: 'x.txt' })
    const lead = leadCalling('writer')
    const { host, session } = await open(leadHarness(lead, [writer.agent]))
    await session.send('write it')

    await resolveAll(session, () => ({
      status: 'resolved',
      payload: { answer: 'reject', message: 'Write y.txt instead.' },
    }))

    expect(write.execute).not.toHaveBeenCalled()
    expect(writer.model.calls).toHaveLength(2)
    expect(JSON.stringify(writer.model.calls[1].messages)).toContain(
      'Write y.txt instead.',
    )
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('goes on without the call when the wait is cancelled', async () => {
    const write = writeTool()
    const writer = toolAgent('writer', write.tool, { path: 'x.txt' })
    const lead = leadCalling('writer')
    const { host, session } = await open(leadHarness(lead, [writer.agent]))
    await session.send('write it')

    const result = await resolveAll(session, () => ({ status: 'cancelled' }))

    expect(result).toMatchObject({ text: 'lead done' })
    expect(write.execute).not.toHaveBeenCalled()
    expect(writer.model.calls).toHaveLength(2)
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('waits for a sign-in of an agent tool, and the agent goes on after it', async () => {
    const seen: Array<string> = []
    const listIssues = toolDefinition({
      name: 'list_issues',
      description: 'List issues',
    }).server<HarnessRunContext>(async (_args, ctx) => {
      const credential = await ctx.context.run.credentials.require('github', {
        wait: true,
      })
      seen.push(credential.type === 'api_key' ? credential.value : '')
      return ['#1']
    })
    const connect = definePlugin({
      name: 'test/github',
      setup: () => ({
        commands: {
          'connect:github': defineCommand({
            description: 'Sign in to GitHub',
            run: async (_input, command) => {
              await command.credentials.set({
                id: 'github',
                credential: { type: 'api_key', value: 'key-1' },
              })
              return 'Connected.'
            },
          }),
        },
      }),
    })
    const tracker = toolAgent('tracker', listIssues, {})
    const lead = leadCalling('tracker')
    const { host, session } = await open(
      leadHarness(lead, [tracker.agent], { plugins: () => [connect] }),
    )

    await session.send('list issues')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ kind: 'sign-in', agent: 'tracker' }),
    ])
    const ended = turnEnd(session)
    await session.runCommand({ name: 'connect:github' })

    expect(await ended).toMatchObject({ outcome: 'completed' })
    expect(seen).toEqual(['key-1'])
    // The agent went on. It did not start again from its first model call.
    expect(tracker.model.calls).toHaveLength(2)
    expect(lead.calls).toHaveLength(2)
    await host.close()
  })

  it('waits for an app interrupt of an agent tool', async () => {
    const review = defineInterrupt({
      id: 'test/review',
      responseSchema: z.object({ ok: z.boolean() }),
    })
    let isAsked = false
    const asker: AnyChatMiddleware = {
      name: 'test/review',
      onInterruptBoundary: (run) => {
        if (run.phase !== 'beforeTools' || isAsked) return undefined
        isAsked = true
        return {
          interrupts: [
            review.interrupt({
              key: 'review-1',
              reason: 'review',
              message: 'Review the plan.',
            }),
          ],
        }
      },
    }
    const write = writeTool()
    const reviewer = toolAgent(
      'reviewer',
      write.tool,
      { path: 'x.txt' },
      'ok',
      {
        middleware: [asker],
      },
    )
    const lead = leadCalling('reviewer')
    const { host, session } = await open(
      leadHarness(lead, [reviewer.agent], {
        plugins: () => [],
        interrupts: [review],
      }),
    )

    await session.send('review it')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({
        kind: 'human',
        agent: 'reviewer',
        message: 'Review the plan.',
      }),
    ])
    const result = await resolveAll(session, () => ({
      status: 'resolved',
      payload: { ok: true },
    }))

    expect(result).toMatchObject({ text: 'lead done' })
    expect(write.execute).toHaveBeenCalledTimes(1)
    expect(reviewer.model.calls).toHaveLength(2)
    await host.close()
  })

  it('waits for a client tool of an agent tool, and the agent gets its output', async () => {
    const pickColor = toolDefinition({
      name: 'pick_color',
      description: 'The user picks a color',
      outputSchema: z.object({ color: z.string() }),
    }).client()
    const painter = toolAgent('painter', pickColor, {})
    const lead = leadCalling('painter')
    const { host, session } = await open(leadHarness(lead, [painter.agent]))

    await session.send('paint')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ kind: 'client-tool', agent: 'painter' }),
    ])
    await resolveAll(session, () => ({
      status: 'resolved',
      payload: { color: 'teal' },
    }))

    expect(painter.model.calls).toHaveLength(2)
    expect(JSON.stringify(painter.model.calls[1].messages)).toContain('teal')
    expect(JSON.stringify(lead.calls[1].messages)).toContain('painter done')
    await host.close()
  })

  it('waits for two agents that run in parallel, and one resolve answers both', async () => {
    const write = writeTool()
    const left = toolAgent('left', write.tool, { path: 'l.txt' })
    const right = toolAgent('right', write.tool, { path: 'r.txt' })
    const lead = leadCalling('left', 'right')
    const { host, session } = await open(
      leadHarness(lead, [left.agent, right.agent]),
    )

    await session.send('write both')
    const waits = session.snapshot().pendingWaits
    expect(waits.map((wait) => wait.agent).sort()).toEqual(['left', 'right'])
    const result = await resolveAll(session, () => ({
      status: 'resolved',
      payload: true,
    }))

    expect(result).toMatchObject({ text: 'lead done' })
    expect(write.execute).toHaveBeenCalledTimes(2)
    expect(left.model.calls).toHaveLength(2)
    expect(right.model.calls).toHaveLength(2)
    const toLead = JSON.stringify(lead.calls[1].messages)
    expect(toLead).toContain('left done')
    expect(toLead).toContain('right done')
    await host.close()
  })

  it('waits for an agent that an agent tool calls, and both go on', async () => {
    const write = writeTool()
    const writer = toolAgent('writer', write.tool, { path: 'x.txt' })
    const researcherModel = mockAdapter([
      () => toolCall('writer', { prompt: 'write x' }, 'call_r'),
      () => text('researcher done'),
    ])
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Researches, then writes',
      run: (ctx) =>
        ctx.chat({
          adapter: researcherModel.adapter,
          subagents: { agents: [writer.agent] },
        }),
    })
    const lead = leadCalling('researcher')
    const { host, session } = await open(leadHarness(lead, [researcher]))

    await session.send('research')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ kind: 'approval', agent: 'writer' }),
    ])
    const result = await resolveAll(session, () => ({
      status: 'resolved',
      payload: true,
    }))

    expect(result).toMatchObject({ text: 'lead done' })
    expect(write.execute).toHaveBeenCalledTimes(1)
    expect(writer.model.calls).toHaveLength(2)
    expect(researcherModel.calls).toHaveLength(2)
    expect(JSON.stringify(lead.calls[1].messages)).toContain('researcher done')
    await host.close()
  })

  it('waits for an agent that a router picks, as for an agent tool', async () => {
    const write = writeTool()
    const writer = toolAgent('writer', write.tool, { path: 'x.txt' })
    const lead = mockAdapter([])
    const { host, session } = await open(
      leadHarness(lead, [], {
        subagents: undefined,
        agents: [writer.agent],
        routing: { router: () => 'writer' },
      }),
    )

    await session.send('write it')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ kind: 'approval', agent: 'writer' }),
    ])
    const result = await resolveAll(session, () => ({
      status: 'resolved',
      payload: true,
    }))

    expect(result).toMatchObject({
      text: expect.stringContaining('writer done'),
    })
    expect(write.execute).toHaveBeenCalledTimes(1)
    expect(writer.model.calls).toHaveLength(2)
    await host.close()
  })
})

/** The next settlement of a sign-in resume that is not `interrupted`. */
function turnEnd(session: HarnessSession) {
  return (async () => {
    for await (const { event } of session.events({
      from: session.snapshot().cursor,
    })) {
      if (event.type !== 'CUSTOM' || event.name !== HARNESS_EVENTS.inputSettled)
        continue
      const value = event.value as { inputId: string; outcome: string }
      if (!value.inputId.startsWith('sign-in:')) continue
      if (value.outcome !== 'interrupted') return value
    }
    throw new Error('The session closed.')
  })()
}
