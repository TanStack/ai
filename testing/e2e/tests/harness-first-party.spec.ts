import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * First-party harness plugins in a session: `agents()`, `permissions()`,
 * `projectInstructions()`, and `title()`. Each test runs one scenario of
 * `/api/harness-first-party`. The model is the OpenAI adapter against
 * aimock, and aimock's journal shows what each model call sent.
 */

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    messages?: Array<{ role: string; content: unknown }>
    tool_choice?: unknown
  } | null
}

/** This test's model calls, in order, from aimock's journal. */
async function modelCalls(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
) {
  const journal = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries: Array<JournalEntry> = await journal.json()
  return entries.filter((entry) =>
    Object.entries(entry.headers ?? {}).some(
      ([key, value]) => key.toLowerCase() === 'x-test-id' && value === testId,
    ),
  )
}

/** The system prompt text of one model call. */
const systemOf = (call: JournalEntry | undefined) =>
  (call?.body?.messages ?? [])
    .filter((message) => message.role === 'system')
    .map((message) =>
      typeof message.content === 'string' ? message.content : '',
    )
    .join('\n')

/** Run one scenario of the route. */
async function runScenario(
  request: APIRequestContext,
  scenario: string,
  testId: string,
) {
  const response = await request.post(
    `/api/harness-first-party?scenario=${scenario}&testId=${encodeURIComponent(testId)}`,
  )
  expect(response.ok()).toBe(true)
  return response.json()
}

test.describe('harness first-party plugins', () => {
  test('agents(): /agent switches the profile, and the step limit makes a last call without tools', async ({
    request,
    testId,
    aimockPort,
  }) => {
    expect(await runScenario(request, 'agents', testId)).toEqual({
      first: 'Built it.',
      switched: 'Agent: brief. It applies at the next turn.',
      second: 'Stopped at the step limit.',
    })

    const calls = await modelCalls(request, aimockPort, testId)
    expect(calls.map((call) => call.body?.tool_choice)).toEqual([
      undefined,
      undefined,
      'none',
    ])
    expect(systemOf(calls[0])).toContain('You are the build agent.')
    expect(systemOf(calls[1])).toContain('You are the brief agent.')
    expect(systemOf(calls[1])).not.toContain('You are the build agent.')
    expect(systemOf(calls[1])).not.toContain('step limit')
    expect(systemOf(calls[2])).toContain('You reached the step limit.')
  })

  test('permissions(): plan mode stops a write in a subagent', async ({
    request,
    testId,
  }) => {
    expect(await runScenario(request, 'plan-subagent', testId)).toEqual({
      writes: 0,
      results: [{ error: 'This tool is not allowed in plan mode.' }],
      text: 'The writer could not write in plan mode.',
    })
  })

  test('projectInstructions(): the environment block reaches the model', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const body = await runScenario(request, 'env', testId)
    expect(body.text).toBe('You are in a new repository.')

    const [call] = await modelCalls(request, aimockPort, testId)
    const system = systemOf(call)
    expect(system).toMatch(/Environment:\n- Date: \d{4}-\d{2}-\d{2}\n/)
    expect(system).toContain(
      [
        `- Platform: ${body.platform}`,
        `- Working folder: ${body.root}`,
        '- Git repository: yes',
        '- Git branch: e2e-env',
      ].join('\n'),
    )
  })

  test('title(): the first turn names the session in the session index', async ({
    request,
    testId,
  }) => {
    expect(await runScenario(request, 'title', testId)).toEqual({
      text: 'Here is a plan for Rome.',
      title: 'Trip to Rome',
      failures: [],
    })
  })
})
