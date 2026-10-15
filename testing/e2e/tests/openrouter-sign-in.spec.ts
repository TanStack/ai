import { test, expect } from './fixtures'

test('openrouter -- signs in through the browser and gets a key', async ({
  request,
  page,
}) => {
  const signIn = request.post('/api/openrouter-sign-in')

  const readAuthUrl = async () => {
    const body: { authUrl?: string } = await (
      await request.get('/api/openrouter-sign-in')
    ).json()
    return body.authUrl
  }
  await expect.poll(readAuthUrl).toBeTruthy()
  const authUrl = new URL((await readAuthUrl()) ?? '')
  expect(authUrl.origin).toBe('https://openrouter.ai')
  expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')

  // OpenRouter sends the browser back to the callback URL with `?code=`.
  const callback = new URL(authUrl.searchParams.get('callback_url') ?? '')
  expect(callback.hostname).toBe('127.0.0.1')
  callback.searchParams.set('code', 'e2e-code')
  await page.goto(callback.toString())
  await expect(page.getByText('You are signed in to OpenRouter')).toBeVisible()

  const response = await signIn
  expect(await response.json()).toEqual({ key: 'sk-or-v1-e2e' })
})
