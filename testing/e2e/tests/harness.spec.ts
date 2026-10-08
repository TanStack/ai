import { test, expect } from './fixtures'

test.describe('harness session', () => {
  test('a second prompt waits for the first and keeps its history', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'turns', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.texts).toEqual(['First answer.', 'Second answer.'])
    expect(body.roles).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  test('a remote harness answers as the model of a chat call', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'remote', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect((await response.json()).answer).toBe(
      'Hello over the harness protocol.',
    )
  })

  test('subagent limits refuse the second child start', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'limits', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.workerRuns).toBe(1)
    expect(body.text).toBe('The second call hit the limit.')
  })

  test('a typed agent runs from code and the next turn sees its result', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'agent', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.result).toBe('Vendor A costs 12 dollars.')
    expect(body.text).toBe('It cost 12 dollars.')
  })

  test('a background agent that a stopped host left running fails and wakes the thread', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'agent-restart', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.status).toBe('failed')
    expect(body.text).toBe('The waiter stopped before it finished.')
  })

  test('a bash background job that a stopped host left running gets a note', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'job-restart', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.texts).toEqual([
      'The dev server runs in the background.',
      'Background job bash-1 stopped when the host restarted.',
    ])
  })

  test('a sweep resumes the work of a stopped host, and nobody opens the thread', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'sweep-restart', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.resumed).toEqual([
      { threadId: 'e2e-sweep', harness: 'e2e/harness-sweep' },
    ])
    expect(body.status).toBe('failed')
    expect(body.text).toBe('The waiter stopped before it finished.')
  })

  test('a resumable background agent continues on the next host, and its step runs once', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'agent-resume', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      attempts: 2,
      charges: 1,
      text: 'The stepper finished.',
    })
  })

  test('a turn that a deploy stopped goes on from its streamed text on the next host', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'cut-off-restart', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body: { transcript: Array<{ role: string; content: unknown }> } =
      await response.json()
    const lines = body.transcript.map(
      (message) => `${message.role}: ${String(message.content)}`,
    )
    // The first host streamed only the start of the story.
    const partial = lines[1] ?? ''
    expect(partial).toMatch(/^assistant: Once upon a time/)
    expect(lines).toEqual([
      'user: [harness-cut-off] tell a long story',
      partial,
      'user: The previous answer was cut off. Continue exactly where it stopped, without repeating it.',
      'assistant: The guitar was ready.',
    ])

    // The model call on the second host got the cut text and the note.
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<{
      headers?: Record<string, string>
      body: { messages?: Array<{ role: string; content: unknown }> } | null
    }> = await journal.json()
    const last = entries
      .filter((entry) => entry.headers?.['x-test-id'] === testId)
      .at(-1)
    const sent = (last?.body?.messages ?? [])
      .filter((message) => message.role !== 'system')
      .map((message) => `${message.role}: ${String(message.content)}`)
    expect(sent).toEqual(lines.slice(0, 3))
  })

  test('routing.router sends each turn to the picked root agents or to the main model', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'routing', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect((await response.json()).texts).toEqual([
      'writer:\nHere is a short draft.',
      'Hello from the main model.',
      // The writer of the second step answers the text of the first step.
      'researcher:\nBees make honey.\n\nseo:\nUse the keyword honey.\n\nwriter:\nBees make honey, so buy honey.',
      'pricer:\nAcme costs 30 dollars.',
    ])
  })

  test('a handoff retries a model error, and an approved routed agent resumes', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'routing-resume', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      handoffText: 'Edited after a retry.',
      approvalText: 'cleaner:\nRemoved a.txt.',
      removed: 1,
    })
  })

  test('a resolve on a new host continues the turn that stopped for approval', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'resolve-restart', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      text: 'Removed b.txt after the restart.',
      removed: 1,
    })
  })

  test('permissions() in plan mode deny the write of a subagent', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'plan-subagent', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      writes: 0,
      results: [{ error: 'This tool is not allowed in plan mode.' }],
      text: 'The writer could not write in plan mode.',
    })
  })

  test("toolExecution: 'sequential' starts the second tool after the first ends", async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'tools-sequential', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      log: ['start:first', 'end:first', 'start:second', 'end:second'],
      text: 'Both steps ran.',
    })
  })

  test("toolExecution: 'parallel' starts the second tool while the first runs", async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario: 'tools-parallel', testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      log: ['start:first', 'start:second', 'end:second', 'end:first'],
      text: 'Both steps ran.',
    })
  })
})
