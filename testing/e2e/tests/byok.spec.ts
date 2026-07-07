import { test, expect } from './fixtures'
import {
  getLastAssistantMessage,
  sendMessage,
  waitForResponse,
} from './helpers'

const KEY = 'sk-e2e-byok-secret-1234'

function byokUrl(testId: string, aimockPort: number, key?: string): string {
  let url = `/byok?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`
  if (key) url += `&key=${encodeURIComponent(key)}`
  return url
}

test.describe('byok', () => {
  test('key rides in the header (not the body), streams a response, shows only last-4', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // The keyring is hydrated with the key (as passkey storage would restore it).
    await page.goto(byokUrl(testId, aimockPort, KEY))

    // Write-only UI: the manager shows only the last 4, never the full key.
    await expect(page.getByTestId('byok-masked-openai')).toHaveText('…1234')
    await expect(page.getByTestId('byok-masked-openai')).not.toContainText(KEY)

    // Capture the outgoing relay request to prove the key is in the header and
    // absent from the persisted body.
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/byok-chat') && req.method() === 'POST',
    )

    await sendMessage(page, '[chat] recommend a guitar')

    const request = await requestPromise
    expect(request.headers()['x-tanstack-byok-openai']).toBe(KEY)
    expect(request.postData() ?? '').not.toContain(KEY)

    await waitForResponse(page)
    expect(await getLastAssistantMessage(page)).toContain('Fender Stratocaster')
  })

  test('missing key surfaces a byokMissing error and does not answer', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(byokUrl(testId, aimockPort))

    // No key entered — the relay returns a typed 401.
    await sendMessage(page, '[chat] recommend a guitar')

    await expect(page.getByTestId('byok-error')).toBeVisible()
    // The relay refused the call, so no real answer is produced.
    expect(await getLastAssistantMessage(page)).not.toContain(
      'Fender Stratocaster',
    )
  })
})
