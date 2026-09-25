import { test, expect } from './fixtures'
import { sendMessage, waitForResponse, featureUrl } from './helpers'

test.describe('AG-UI message metadata', () => {
  test('stamps user metadata onto the UIMessage and the RunAgentInput wire', async ({
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

    await page.goto(
      featureUrl('openai', 'chat', testId, aimockPort) + '&stampMetadata=1',
    )

    await sendMessage(page, '[chat] hello')
    await waitForResponse(page)

    await expect(page.getByTestId('user-metadata')).toContainText('user-42')

    expect(requestBodies.length).toBeGreaterThanOrEqual(1)
    const first = requestBodies[0]!
    const user = first.messages.find((m: any) => m.role === 'user')
    expect(user).toBeDefined()
    expect(user.metadata.author.id).toBe('user-42')
    expect(user).not.toHaveProperty('parts')
  })
})
