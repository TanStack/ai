import { test, expect } from './fixtures'
import { sendMessage, waitForResponse, featureUrl } from './helpers'

test.describe('AG-UI client-to-server compliance', () => {
  test('POST body has RunAgentInput shape and persists threadId across sends', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const requestBodies: Array<any> = []
    page.on('request', (request) => {
      if (request.url().includes('/api/chat') && request.method() === 'POST') {
        const body = request.postDataJSON()
        if (body) requestBodies.push(body)
      }
    })

    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    // Send first message
    await sendMessage(page, '[chat] hello')
    await waitForResponse(page)

    // Send second message in the same session
    await sendMessage(page, '[chat] another message')
    await waitForResponse(page)

    expect(requestBodies.length).toBeGreaterThanOrEqual(2)

    const first = requestBodies[0]!
    const second = requestBodies[1]!

    // Wire shape: every field required by RunAgentInput must be present
    for (const body of [first, second]) {
      expect(body).toHaveProperty('threadId')
      expect(body).toHaveProperty('runId')
      expect(body).toHaveProperty('state')
      expect(body).toHaveProperty('messages')
      expect(body).toHaveProperty('tools')
      expect(body).toHaveProperty('context')
      expect(body).toHaveProperty('forwardedProps')
      expect(Array.isArray(body.messages)).toBe(true)
      expect(Array.isArray(body.tools)).toBe(true)
    }

    // threadId continuity: same session → same threadId
    expect(first.threadId).toBe(second.threadId)

    // runId freshness: each send generates a new runId
    expect(first.runId).not.toBe(second.runId)

    // Anchor messages carry `parts` (re-attached by chatParamsFromRequestBody)
    const anchors = second.messages.filter(
      (m: any) =>
        m.role === 'user' || m.role === 'system' || m.role === 'assistant',
    )
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) {
      expect(a).toHaveProperty('parts')
      expect(Array.isArray(a.parts)).toBe(true)
    }
  })
})
