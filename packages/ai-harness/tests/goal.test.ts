import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { GoalMet, goal, selectGoal } from '../src/first-party'
import { createSessionView } from '../src/view'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, AnyTool } from '@tanstack/ai'
import type { HarnessSession } from '../src'
import type { Goal } from '../src/first-party'

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
  persistence?: ReturnType<typeof memoryPersistence>
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
    { threadId: 't' },
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
  return session.command('goal')
}

/** Wait until `/goal` shows `expected`. */
async function waitForStatus(session: HarnessSession, expected: string) {
  await vi.waitFor(async () => expect(await status(session)).toBe(expected))
}

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

    expect(await session.command('goal', 'all tests pass')).toBe(
      'Goal: all tests pass\nStatus: active, round 0 of 20.',
    )
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: met, round 3 of 20.\nLast check: All tests pass.',
    )

    expect(calls).toHaveLength(3)
    expect(lastMessage(calls[0])).toBe('Work toward this goal: all tests pass')
    expect(lastMessage(calls[2])).toBe(
      'Keep working on the goal: all tests pass. Last check: One test still fails.',
    )
    expect(JSON.stringify(calls[0].systemPrompts)).toContain(
      'You work toward this goal: all tests pass.',
    )
    expect(read).toHaveLength(3)
    expect(read[0]).toContain('Goal: all tests pass')
    expect(read[0]).toContain('assistant: wrote the test')
    expect(met).toEqual([{ goal: 'all tests pass', reason: 'All tests pass.' }])
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(session.snapshot().queuedTurns).toBe(0)
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

    await session.command('goal', 'finish')
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

    await session.command('goal', 'all tests pass')
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: stopped, round 2 of 2.\nThe round limit (2) is reached. Run /goal resume for more rounds.\nLast check: One test fails.',
    )
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
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
    expect(await session.command('goal', 'stop')).toBe('No goal is running.')

    await session.command('goal', 'create hello.txt')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(await session.command('goal', 'stop')).toBe(
      'Goal: create hello.txt\nStatus: stopped, round 1 of 20.\nYou stopped the goal.',
    )
    hold.open()
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    expect(read).toHaveLength(0)

    expect(await session.command('goal', 'resume')).toBe(
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

    await session.command('goal', 'all tests pass')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    const question = session.prompt('what time is it?')
    hold.open()
    await question

    expect(await status(session)).toBe(
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nYou sent a message, so the goal paused. Run /goal resume to continue.\nLast check: Not yet.',
    )
    expect(calls).toHaveLength(2)
    expect(lastMessage(calls[1])).toBe('what time is it?')

    await session.command('goal', 'resume')
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

  it('drops its queued turn when a late steer pauses the goal', async () => {
    const hold = gate()
    const { host, session, calls } = await start({
      replies: [
        after(hold.opened, 'step one'),
        () => text('It is noon.'),
        () => text('an extra goal turn'),
      ],
      verdicts: [{ met: false, reason: 'Not yet.' }],
    })

    await session.command('goal', 'all tests pass')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    // The last model call of the turn is in flight, so the steer comes too late.
    await session.steer('what time is it?')
    hold.open()

    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nYou sent a message, so the goal paused. Run /goal resume to continue.\nLast check: Not yet.',
    )
    await vi.waitFor(() => {
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
    await persistence.stores.metadata.set('plugin:tanstack/goal', 't', active)
    const { host, session, calls, read } = await start({
      persistence,
      replies: [() => text('Hello.')],
    })

    await session.prompt('hello')
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

    await session.command('goal', 'clean the folder')
    await vi.waitFor(() =>
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

  it('pauses when the judge does not answer with a verdict', async () => {
    const { adapter: judge } = mockAdapter([])
    const { host, session, calls } = await start({
      replies: [() => text('did something')],
      judge,
    })

    await session.command('goal', 'all tests pass')
    await waitForStatus(
      session,
      'Goal: all tests pass\nStatus: paused, round 1 of 20.\nThe judge failed: The judge did not answer with met and reason.',
    )
    expect(calls).toHaveLength(1)
    await host.close()
  })

  it('keeps the goal and its state across a restart', async () => {
    const persistence = memoryPersistence()
    const first = await start({
      persistence,
      replies: [() => text('step one'), untilAborted()],
      verdicts: [{ met: false, reason: 'Half done.' }],
    })
    await first.session.command('goal', 'all tests pass')
    await vi.waitFor(() => expect(first.calls).toHaveLength(2))
    await first.host.close()

    const second = await start({
      persistence,
      replies: [() => text('all green')],
      verdicts: [{ met: true, reason: 'All tests pass.' }],
    })
    expect(await status(second.session)).toBe(
      'Goal: all tests pass\nStatus: paused, round 2 of 20.\nThe last turn was cancelled. Run /goal resume to continue.\nLast check: Half done.',
    )
    await second.session.command('goal', 'resume')
    await waitForStatus(
      second.session,
      'Goal: all tests pass\nStatus: met, round 1 of 20.\nLast check: All tests pass.',
    )
    expect(lastMessage(second.calls[0])).toBe(
      'Keep working on the goal: all tests pass. Last check: Half done.',
    )
    await second.host.close()
  })

  it('gives a UI the goal through the session view', async () => {
    const { host, session } = await start({
      replies: [() => text('done')],
      verdicts: [{ met: true, reason: 'Done.' }],
    })
    const view = createSessionView(session)
    await view.ready
    expect(selectGoal(view.store.get())).toBeNull()

    await session.command('goal', 'finish')

    await vi.waitFor(() =>
      expect(selectGoal(view.store.get())).toMatchObject({
        text: 'finish',
        status: 'met',
      }),
    )
    view.dispose()
    await host.close()
  })
})
