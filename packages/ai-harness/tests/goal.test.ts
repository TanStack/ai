import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { GoalMet, goal, selectGoal } from '../src/first-party'
import { loadLogState, logIdOf, sessionOf } from '../src/log'
import {
  after,
  appendToLog,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, AnyTool } from '@tanstack/ai'
import type {
  HarnessPersistence,
  HarnessRunContext,
  HarnessSession,
} from '../src'
import type { Goal } from '../src/first-party'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

interface Verdict {
  met: boolean
  reason: string
}

/** A judge that answers with `verdicts` in order. Keeps what it read. */
function scriptedJudge(verdicts: Array<Verdict>) {
  const { adapter } = mockAdapter([])
  const read: Array<string> = []
  const judge: AnyTextAdapter = {
    ...adapter,
    structuredOutput: async (options) => {
      read.push(JSON.stringify(options.chatOptions.messages))
      const data = verdicts[read.length - 1] ?? {
        met: false,
        reason: 'No verdict left.',
      }
      return { data, rawText: JSON.stringify(data) }
    },
  }
  return { judge, read }
}

async function start(options: {
  replies: Parameters<typeof mockAdapter>[0]
  verdicts?: Array<Verdict>
  judge?: AnyTextAdapter
  maxRounds?: number
  tools?: Array<AnyTool>
  persistence?: HarnessPersistence
  busy?: 'queue' | 'reject'
}) {
  const main = mockAdapter(options.replies)
  const scripted = scriptedJudge(options.verdicts ?? [])
  const met: Array<{ goal: string; reason: string }> = []
  const listener = definePlugin({
    name: 'test/goal-listener',
    setup: (ctx) => {
      ctx.on(GoalMet, (value) => met.push(value))
    },
  })
  const persistence = options.persistence ?? memoryPersistence()
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/goal',
      adapter: main.adapter,
      tools: options.tools ?? [],
      busy: options.busy,
      plugins: () => [
        goal({
          judge: options.judge ?? scripted.judge,
          maxRounds: options.maxRounds,
        }),
        listener,
      ],
    }),
    {
      threadId: 't',
    },
  )
  return {
    host,
    session,
    persistence,
    calls: main.calls,
    read: scripted.read,
    met,
  }
}

/** What `/goal` shows. */
async function status(session: HarnessSession) {
  return session.runCommand({ name: 'goal' })
}

/** Wait until `/goal` shows `expected`. */
async function waitForStatus(session: HarnessSession, expected: string) {
  await waitFor(async () => expect(await status(session)).toBe(expected))
}

/** The goal prompt: a `'context'` prompt, the last system prompt. */
const GOAL_PROMPT = 'You work toward this goal:'

/** The last message the main model got on `call`. */
function lastMessage(call: unknown) {
  return messageTexts(call).at(-1)
}

describe('goal', () => {
  it('runs turns until the judge says the goal is met', async () => {
    const { host, session, calls, read, met } = await start({
      replies: [
        () => text('wrote the test'),
        () => text('fixed the bug'),
        () => text('all green'),
      ],
      verdicts: [
        { met: false, reason: 'The test fails.' },
        { met: false, reason: 'One test still fails.' },
        { met: true, reason: 'All tests pass.' },
      ],
    })

    expect(
      await session.runCommand({ name: 'goal', input: 'all tests pass' }),
    ).toBe('Goal: all tests pass\nStatus: active, round 0 of 20.')
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: met, round 3 of 20.\nLast check: All tests pass.',
    )

    expect(calls).toHaveLength(3)
    expect(lastMessage(calls[0])).toBe('Work toward this goal: all tests pass')
    expect(lastMessage(calls[2])).toBe(
      'Keep working on the goal: all tests pass. Last check: One test still fails.',
    )
    // The goal prompt is the last system prompt, not a message.
    expect(JSON.stringify(calls[0].systemPrompts.at(-1))).toContain(
      `${GOAL_PROMPT} all tests pass.`,
    )
    expect(JSON.stringify(calls[0].messages)).not.toContain(GOAL_PROMPT)
    expect(read).toHaveLength(3)
    expect(read[0]).toContain('Goal: all tests pass')
    expect(read[0]).toContain('assistant: wrote the test')
    expect(met).toEqual([{ goal: 'all tests pass', reason: 'All tests pass.' }])
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(session.snapshot().queuedTurns).toBe(0)
    await host.close()
  })

  it('counts each judge call under plugin:tanstack/goal', async () => {
    const { adapter } = mockAdapter([])
    const judge: AnyTextAdapter = {
      ...adapter,
      structuredOutput: async () => ({
        data: { met: true, reason: 'Done.' },
        rawText: '{}',
        usage: { promptTokens: 30, completionTokens: 5, totalTokens: 35 },
      }),
    }
    const { host, session } = await start({
      replies: [() => text('done')],
      judge,
    })

    await session.runCommand({ name: 'goal', input: 'finish' })
    await waitForStatus(
      session,
      'Goal: finish\nStatus: met, round 1 of 20.\nLast check: Done.',
    )

    expect(session.usage().bySource).toEqual({
      'plugin:tanstack/goal': expect.objectContaining({
        calls: 1,
        totalTokens: 35,
      }),
    })
    await host.close()
  })

  it('keeps going on a harness that rejects prompts while busy', async () => {
    const { host, session, calls } = await start({
      replies: [() => text('try one'), () => text('done')],
      verdicts: [
        { met: false, reason: 'Not yet.' },
        { met: true, reason: 'Done.' },
      ],
      busy: 'reject',
    })

    await session.runCommand({ name: 'goal', input: 'finish' })
    await waitForStatus(
      session,
      'Goal: finish\nStatus: met, round 2 of 20.\nLast check: Done.',
    )
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('stops at the round limit and keeps the last reason', async () => {
    const { host, session, calls } = await start({
      replies: [() => text('try one'), () => text('try two')],
      verdicts: [
        { met: false, reason: 'Two tests fail.' },
        { met: false, reason: 'One test fails.' },
      ],
      maxRounds: 2,
    })

    await session.runCommand({ name: 'goal', input: 'all tests pass' })
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: stopped, round 2 of 2.\nThe round limit (2) is reached. Run /goal resume for more rounds.\nLast check: One test fails.',
    )
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('shows the goal, stops it, and resumes it', async () => {
    const hold = gate()
    const { host, session, calls, read } = await start({
      replies: [after(hold.opened, 'half done'), () => text('done')],
      verdicts: [{ met: true, reason: 'The file exists.' }],
    })

    expect(await status(session)).toBe(
      'No goal. Start one with /goal <what done looks like>.',
    )
    expect(await session.runCommand({ name: 'goal', input: 'stop' })).toBe(
      'No goal is running.',
    )

    await session.runCommand({ name: 'goal', input: 'create hello.txt' })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(await session.runCommand({ name: 'goal', input: 'stop' })).toBe(
      'Goal: create hello.txt\nStatus: stopped, round 1 of 20.\nYou stopped the goal.',
    )
    hold.open()
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(read).toHaveLength(0)

    expect(await session.runCommand({ name: 'goal', input: 'resume' })).toBe(
      'Goal: create hello.txt\nStatus: active, round 0 of 20.',
    )
    await waitForStatus(
      session,
      'Goal: create hello.txt\nStatus: met, round 1 of 20.\nLast check: The file exists.',
    )
    expect(calls).toHaveLength(2)
    expect(lastMessage(calls[1])).toBe(
      'Work toward this goal: create hello.txt',
    )
    await host.close()
  })

  it('resumes an active goal whose queued turn was cancelled', async () => {
    const hold = gate()
    const { host, session, calls } = await start({
      replies: [after(hold.opened, 'It is noon.'), () => text('done')],
      verdicts: [{ met: true, reason: 'Done.' }],
    })

    const question = session.send('what time is it?')
    await waitFor(() => expect(calls).toHaveLength(1))
    await session.runCommand({ name: 'goal', input: 'finish' })
    await waitFor(() => expect(session.waitingInputs()).toHaveLength(1))
    const [waiting] = session.waitingInputs()
    if (waiting) await session.cancelInput({ inputId: waiting.inputId })
    hold.open()
    await question
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(await status(session)).toBe(
      'Goal: finish\nStatus: active, round 0 of 20.',
    )

    await session.runCommand({ name: 'goal', input: 'resume' })
    await waitForStatus(
      session,
      'Goal: finish\nStatus: met, round 1 of 20.\nLast check: Done.',
    )
    expect(calls).toHaveLength(2)
    await host.close()
  })

  it('pauses when the user sends a message while a goal turn runs', async () => {
    const hold = gate()
    const { host, session, calls } = await start({
      replies: [
        after(hold.opened, 'step one'),
        () => text('It is noon.'),
        () => text('step two'),
      ],
      verdicts: [
        { met: false, reason: 'Not yet.' },
        { met: true, reason: 'Done.' },
      ],
    })

    await session.runCommand({ name: 'goal', input: 'all tests pass' })
    await waitFor(() => expect(calls).toHaveLength(1))
    const question = session.send('what time is it?')
    hold.open()
    await question

    expect(await status(session)).toBe(
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nYou sent a message, so the goal paused. Run /goal resume to continue.\nLast check: Not yet.',
    )
    expect(calls).toHaveLength(2)
    expect(lastMessage(calls[1])).toBe('what time is it?')

    await session.runCommand({ name: 'goal', input: 'resume' })
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: met, round 1 of 20.\nLast check: Done.',
    )
    // No extra goal turn ran after the user's message.
    expect(calls).toHaveLength(3)
    expect(lastMessage(calls[2])).toBe(
      'Keep working on the goal: all tests pass. Last check: Not yet.',
    )
    await host.close()
  })

  it('pauses, and queues no goal turn, when a late steer joins its turn', async () => {
    const hold = gate()
    const { host, session, calls } = await start({
      replies: [
        after(hold.opened, 'step one'),
        () => text('It is noon.'),
        () => text('an extra goal turn'),
      ],
      verdicts: [{ met: false, reason: 'Not yet.' }],
    })

    await session.runCommand({ name: 'goal', input: 'all tests pass' })
    await waitFor(() => expect(calls).toHaveLength(1))
    // The last model call of the turn is in flight, so the steer comes too late.
    await session.send('what time is it?', { mode: 'steer' }).receipt
    hold.open()

    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nYou sent a message, so the goal paused. Run /goal resume to continue.\nLast check: Not yet.',
    )
    await waitFor(() => {
      expect(session.snapshot().status).toBe('idle')
      expect(session.snapshot().queuedTurns).toBe(0)
    })
    expect(calls).toHaveLength(2)
    expect(lastMessage(calls[1])).toBe('what time is it?')
    await host.close()
  })

  it('pauses when a user message starts a turn while the goal is active', async () => {
    // A host that stopped during a goal turn leaves the goal active.
    const persistence = memoryPersistence()
    const active: Goal = {
      text: 'all tests pass',
      status: 'active',
      round: 1,
      reason: '',
      note: '',
      queued: '',
    }
    await appendToLog(persistence.stores.log, { threadId: 't' }, [
      {
        type: 'harness.plugin.state',
        plugin: 'tanstack/goal',
        delta: { path: [], value: active },
      },
    ])
    const { host, session, calls, read } = await start({
      persistence,
      replies: [() => text('Hello.')],
    })

    await session.send('hello')
    expect(await status(session)).toBe(
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nYou sent a message, so the goal paused. Run /goal resume to continue.',
    )
    expect(calls).toHaveLength(1)
    expect(read).toHaveLength(0)
    await host.close()
  })

  it('does not start a turn when a turn waits for approval', async () => {
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async () => ({ removed: true }))
    const { host, session, calls, read } = await start({
      replies: [() => toolCall('remove', { path: 'old.txt' })],
      tools: [remove],
    })

    await session.runCommand({ name: 'goal', input: 'clean the folder' })
    await waitFor(() =>
      expect(session.snapshot().status).toBe('requires_action'),
    )
    expect(await status(session)).toBe(
      'Goal: clean the folder\nStatus: paused, round 1 of 20.\nThe last turn waits for approval. Answer it, then run /goal resume.',
    )
    expect(calls).toHaveLength(1)
    expect(read).toHaveLength(0)
    expect(session.snapshot().queuedTurns).toBe(0)
    await host.close()
  })

  it('says the turn waits for input when it waits for something else than an approval', async () => {
    const listIssues = toolDefinition({
      name: 'list_issues',
      description: 'List issues',
    }).server(async (_args, ctx) => {
      const { run } = ctx?.context as HarnessRunContext
      await run.credentials.require('github', { wait: true })
      return ['#1']
    })
    const { host, session, calls } = await start({
      replies: [() => toolCall('list_issues', {})],
      tools: [listIssues],
    })

    await session.runCommand({ name: 'goal', input: 'triage the issues' })
    await waitFor(() =>
      expect(session.snapshot().status).toBe('requires_action'),
    )
    expect(await status(session)).toBe(
      'Goal: triage the issues\nStatus: paused, round 1 of 20.\nThe last turn waits for input. Answer it, then run /goal resume.',
    )
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('pauses when the judge does not answer with a verdict', async () => {
    const { adapter: judge } = mockAdapter([])
    const { host, session, calls } = await start({
      replies: [() => text('did something')],
      judge,
    })

    await session.runCommand({ name: 'goal', input: 'all tests pass' })
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nThe judge failed: The judge did not answer with met and reason.',
    )
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('keeps the goal and its state across a restart', async () => {
    // The first host closed, so the second host takes the log at once, as
    // after a restart.
    const { log, metadata } = memoryPersistence().stores
    const persistence = { stores: { log, metadata } }
    const first = await start({
      persistence,
      replies: [() => text('step one'), untilAborted()],
      verdicts: [{ met: false, reason: 'Half done.' }],
    })
    await first.session.runCommand({ name: 'goal', input: 'all tests pass' })
    await waitFor(() => expect(first.calls).toHaveLength(2))
    await first.host.close()

    const second = await start({
      persistence,
      replies: [() => text('all green')],
      verdicts: [{ met: true, reason: 'All tests pass.' }],
    })
    expect(await status(second.session)).toBe(
      'Goal: all tests pass\nStatus: paused, round 2 of 20.\nThe last turn was cancelled. Run /goal resume to continue.\nLast check: Half done.',
    )
    await second.session.runCommand({ name: 'goal', input: 'resume' })
    await waitForStatus(
      second.session,
      'Goal: all tests pass\nStatus: met, round 1 of 20.\nLast check: All tests pass.',
    )
    expect(lastMessage(second.calls[0])).toBe(
      'Keep working on the goal: all tests pass. Last check: Half done.',
    )
    await second.host.close()
  })

  it('gives a UI the goal through the session snapshot', async () => {
    const { host, session } = await start({
      replies: [() => text('done')],
      verdicts: [{ met: true, reason: 'Done.' }],
    })
    expect(selectGoal(session.snapshot())).toBeNull()

    await session.runCommand({ name: 'goal', input: 'finish' })

    await waitFor(() =>
      expect(selectGoal(session.snapshot())).toMatchObject({
        text: 'finish',
        status: 'met',
      }),
    )
    await host.close()
  })

  it('gives no goal for goal plugin state that is not a goal', () => {
    const state = { plugins: { 'tanstack/goal': { text: 'finish' } } }

    expect(selectGoal(state)).toBeNull()
  })
})

describe('goal with two users', () => {
  it('runs each round as the user who set the goal, not as the owner of the thread', async () => {
    const main = mockAdapter([
      () => text('Round one.'),
      () => text('Round two.'),
    ])
    const { judge } = scriptedJudge([
      { met: false, reason: 'Not yet.' },
      { met: true, reason: 'Done.' },
    ])
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({
      name: 'test/goal',
      adapter: main.adapter,
      plugins: () => [goal({ judge })],
    })
    // Olga opens the thread first, so she owns it.
    await host.open(harness, { threadId: 't', user: { id: 'olga' } })
    const bea = await host.open(harness, {
      threadId: 't',
      user: { id: 'bea' },
    })

    await bea.runCommand({ name: 'goal', input: 'ship it' })
    await waitFor(() => expect(main.calls).toHaveLength(2))
    await bea.whenIdle()

    const state = await loadLogState({
      store: persistence.stores.log,
      logId: logIdOf({ logId: 't' }),
      rootThread: 't',
    })
    const prompts = [...sessionOf(state, 't').inputs.values()]
      .filter((logged) => logged.input.op === 'prompt')
      .map((logged) => logged.user?.id)
    expect(prompts).toEqual(['bea', 'bea'])
    await host.close()
  })
})
