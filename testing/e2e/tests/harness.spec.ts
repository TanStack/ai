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
})
