import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const ROUTE = '/api/harness-agent-tree'

interface AgentRun {
  runId: string
  agent: string
  status: string
  parentRunId: string | null
  error: { message: string; code?: string } | null
}

interface GroupResult {
  results: Array<string>
  leadRunId: string
  runs: Array<AgentRun>
  order: Array<string>
  maxActive: number
}

interface BudgetResult {
  leadResult: string
  leadRunId: string
  runs: Array<AgentRun>
}

interface StateResult {
  count: number
  runs: Array<AgentRun>
}

interface HarnessAgentResult {
  text: string
  turnId: string
  childTextParentRunId: string | null
  totalTokens: number
  threadId: string
  childThread: string | null
  openError: string | null
}

interface Read<T> {
  error?: string
  done: boolean
  result: T | null
}

/** Run `scenario` on the server, and return its result when it ends. */
async function runScenario<T>(request: APIRequestContext, scenario: string) {
  const res = await request.post(ROUTE, { data: { scenario } })
  expect(res.ok()).toBe(true)
  const started: { error?: string; runId: string } = await res.json()
  expect(started.error ?? null).toBeNull()

  let read: Read<T> | undefined
  await expect
    .poll(
      async () => {
        const got = await request.get(`${ROUTE}?runId=${started.runId}`)
        read = await got.json()
        return read?.error ?? read?.done
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  return read!.result!
}

test.describe('harness: the agent tree of a session', () => {
  test('a group runs its agents two at a time, returns the results in order, and keeps them as children of the lead run', async ({
    request,
  }) => {
    const result = await runScenario<GroupResult>(request, 'group')

    expect(result.results).toEqual(['a: auth', 'b: billing', 'c: search'])
    // `a` and `b` start first. `c` waits for a slot, and starts after one
    // of them ends.
    expect(result.maxActive).toBe(2)
    expect([...result.order.slice(0, 2)].sort()).toEqual(['start a', 'start b'])
    const firstEnd = result.order.findIndex((entry) => entry.startsWith('end '))
    expect(result.order.indexOf('start c')).toBeGreaterThan(firstEnd)

    // The run tree: the lead is a root run, and a, b, and c are its children.
    expect(result.runs).toEqual([
      expect.objectContaining({
        runId: result.leadRunId,
        agent: 'lead',
        status: 'completed',
        parentRunId: null,
      }),
      ...['a', 'b', 'c'].map((agent) =>
        expect.objectContaining({
          agent,
          status: 'completed',
          parentRunId: result.leadRunId,
        }),
      ),
    ])
  })

  test('a run over its token budget fails with code budget, and its parent sees the code', async ({
    request,
  }) => {
    const result = await runScenario<BudgetResult>(request, 'budget')

    // The lead caught the error of the worker and returned its code.
    expect(result.leadResult).toBe('budget')
    expect(result.runs).toEqual([
      expect.objectContaining({ agent: 'lead', status: 'completed' }),
      expect.objectContaining({
        agent: 'worker',
        status: 'failed',
        parentRunId: result.leadRunId,
        error: expect.objectContaining({ code: 'budget' }),
      }),
    ])
  })

  test('two agents update one shared state, and the value has both updates', async ({
    request,
  }) => {
    const result = await runScenario<StateResult>(request, 'state')

    // 0 + 1 + 10: neither update was lost.
    expect(result.count).toBe(11)
    expect(
      result.runs.filter((run) => run.agent === 'adder').map((r) => r.status),
    ).toEqual(['completed', 'completed'])
  })

  test('harnessAgent runs a child harness in the session tree', async ({
    request,
  }) => {
    const result = await runScenario<HarnessAgentResult>(
      request,
      'harness-agent',
    )

    expect(result.text).toBe('Done.')
    // The text of the child reaches the parent stream, marked with the run
    // that called it.
    expect(result.childTextParentRunId).toBe(result.turnId)
    // Two lead calls of 6 tokens, and one child call of 41 tokens.
    expect(result.totalTokens).toBe(53)
    // The child has its own thread under the root, and nobody opens it alone.
    expect(result.childThread).toMatch(
      new RegExp(`^${result.threadId}/agent/.+`),
    )
    expect(result.openError).toContain('is the thread of a harnessAgent child')
  })
})
