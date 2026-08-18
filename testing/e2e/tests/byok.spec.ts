import { test, expect } from './fixtures'
import { sendMessage } from './helpers'

const RAW_KEY = 'sk-e2e-byok-test-1234'

function byokUrl(testId: string, aimockPort: number): string {
  return `/byok?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`
}

test.describe('byok', () => {
  test('saves a key and sends it in the x-byok-openai header, not the body', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(byokUrl(testId, aimockPort))

    const keyInput = page.getByTestId('byok-key-input')
    await keyInput.fill(RAW_KEY)
    await expect(keyInput).toHaveValue(RAW_KEY)
    await page.getByTestId('byok-save-button').click()
    await expect(page.getByTestId('byok-last4')).toHaveText('1234')

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/byok-chat') && req.method() === 'POST',
    )
    await sendMessage(page, '[chat] recommend a guitar')
    const request = await requestPromise

    expect(request.headers()['x-byok-openai']).toBe(RAW_KEY)
    expect(request.postData() ?? '').not.toContain(RAW_KEY)
  })

  test('prompts for openai when sending without a key', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(byokUrl(testId, aimockPort))

    await sendMessage(page, 'hello')
    await expect(page.getByTestId('byok-prompt')).toHaveText('openai')
  })
})
