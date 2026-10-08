import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Harness plugins in a session: `session.reload()`, `agents()`,
 * `projectInstructions()`, `snapshots()`, `formatter()`, `mcp()`, and
 * `title()`. Each test runs one scenario of `/api/harness-test`. The model
 * is the OpenAI adapter against aimock, and aimock's journal shows what each
 * model call sent.
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
  return entries.filter((entry) => entry.headers?.['x-test-id'] === testId)
}

/** The system prompt text of one model call. */
const systemOf = (call: JournalEntry | undefined) =>
  (call?.body?.messages ?? [])
    .filter((message) => message.role === 'system')
    .map((message) =>
      typeof message.content === 'string' ? message.content : '',
    )
    .join('\n')

test.describe('harness plugins', () => {
  test('agents(): /agent switches the profile, and the step limit makes a last call without tools', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-agents', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
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

  test('session.reload(): the next turn calls a tool of the new plugin list', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-reload', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      before: 'No stamp yet.',
      after: 'Stamped it.',
      stamped: 1,
    })
  })

  test('session.reload(): a background bash job keeps running, and its end note wakes the thread', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-reload-job', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.started).toBe('Started the job.')
    expect(body.texts).toContainEqual(
      expect.stringContaining(
        'Background job bash-1 ended.\nexit code: 0\n[harness-reload-job] done',
      ),
    )
    expect(body.texts.at(-1)).toBe('Saw the job end.')
  })

  test('projectInstructions(): the environment block reaches the model', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-env', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
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

  test('snapshots(): /undo restores the file and removes the turn', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-undo', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      text: 'Changed a.txt.',
      written: 'two',
      undo: 'Undid the last turn. Files restored: 1.',
      restored: 'one',
      transcript: [],
    })
  })

  test('formatter(): a test formatter runs after write_file', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-format', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      text: 'Wrote b.txt.',
      content: 'QUIET TEXT',
      failures: [],
    })
  })

  test('mcp(): each server has a status, and the model calls <server>_<tool>', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-mcp', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const error =
      'Failed to connect to MCP server: Version negotiation probe failed: connection refused'
    expect(await response.json()).toEqual({
      status: `local: connected (1 tool)\nbroken: failed: ${error}`,
      state: {
        servers: [
          { name: 'local', status: 'connected', toolCount: 1 },
          { name: 'broken', status: 'failed', error, toolCount: 0 },
        ],
      },
      results: [{ tool: 'local_echo', result: 'hello from mcp' }],
      text: 'The server said hello from mcp.',
    })
  })

  test('title(): the first turn names the session in the session index', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plugin-title', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      text: 'Here is a plan for Rome.',
      title: 'Trip to Rome',
      failures: [],
    })
  })
})
