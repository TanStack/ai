import { test, expect } from './fixtures'
import { sendMessage, waitForResponse } from './helpers'

const RAW_KEY = 'sk-e2e-byok-test-1234'

function byokUrl(
  testId: string,
  aimockPort: number,
  options?: { serverCoverage?: boolean },
): string {
  const params = new URLSearchParams({
    testId,
    aimockPort: String(aimockPort),
  })
  if (options?.serverCoverage) params.set('serverCoverage', '1')
  return `/byok?${params.toString()}`
}

test.describe('byok', () => {
  test('saves through a second PRF ceremony and rejects a later unlock without activation', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.addInitScript(() => {
      const activation = { isActive: true }
      Object.defineProperty(navigator, 'userActivation', { value: activation })
      class Passkey {
        rawId = new Uint8Array([1, 2, 3]).buffer
        constructor(private registration: boolean) {}
        getClientExtensionResults() {
          return this.registration
            ? { prf: { enabled: true } }
            : { prf: { results: { first: new Uint8Array(32) } } }
        }
      }
      Object.defineProperty(window, 'PublicKeyCredential', { value: Passkey })
      Object.defineProperty(navigator, 'credentials', {
        value: {
          async create() {
            activation.isActive = false
            return new Passkey(true)
          },
          async get() {
            return new Passkey(false)
          },
        },
      })
    })
    await page.goto(`${byokUrl(testId, aimockPort)}&passkey=1`)
    await page.getByTestId('byok-key-input').fill(RAW_KEY)
    await page.getByTestId('byok-save-button').click()
    await expect(page.getByTestId('byok-last4')).toHaveText('1234')
    await page.reload()
    await expect(page.getByTestId('byok-last4')).toHaveText('1234')
    await page.evaluate(() => {
      Object.defineProperty(navigator.userActivation, 'isActive', {
        value: false,
      })
    })
    await page.getByTestId('byok-unlock-button').click()
    await expect(page.getByTestId('byok-error')).toContainText(
      'fresh user action',
    )
  })

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

    await waitForResponse(page)
    await expect(page.getByTestId('assistant-message').first()).toBeVisible()
    await expect(page.getByTestId('byok-prompt')).toHaveText('')
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

  test('sets the missing prompt from a byokMissing 401', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(byokUrl(testId, aimockPort, { serverCoverage: true }))

    await sendMessage(page, 'hello')
    await expect(page.getByTestId('byok-prompt')).toHaveText('openai')
  })
})
