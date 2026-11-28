import { test, expect } from './fixtures'

/**
 * `useRealtimeChat` with a relay adapter and `createSession`. The page uses a
 * fake relay adapter (no WebRTC, no microphone) whose `createSession` posts to
 * the real `/api/live-session` relay route, which answers from aimock.
 */
test.describe('useRealtimeChat with createSession', () => {
  test('relays the offer to the app server, with no token and no session.update', async ({
    page,
  }) => {
    const pageErrors: Array<string> = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const apiPaths: Array<string> = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname.startsWith('/api/')) {
        apiPaths.push(`${request.method()} ${pathname}`)
      }
    })

    await page.goto('/realtime-relay')
    const relayRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/live-session',
    )
    await page.getByTestId('connect-button').click()

    const body = (await relayRequest).postDataJSON()
    expect(body.sdp).toBe('v=0 offer-e2e')
    expect(body.config.instructions).toBe('client')

    await expect(page.getByTestId('status')).toHaveText('connected')
    await expect(page.getByTestId('session-id')).toHaveText('sess_e2e')
    await expect(page.getByTestId('update-session-calls')).toHaveText('0')
    // The relay request is the only app-server call: no token route.
    expect(apiPaths).toEqual(['POST /api/live-session'])
    expect(pageErrors).toEqual([])
  })
})
