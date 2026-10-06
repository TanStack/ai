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
