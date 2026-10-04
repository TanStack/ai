import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openrouterSignIn } from '../src/pkce'

interface KeyExchangeBody {
  code: string
  code_verifier: string
  code_challenge_method: string
}

/** Stands in for OpenRouter's key endpoint and keeps each request body. */
function keyEndpoint() {
  const bodies: Array<KeyExchangeBody> = []
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'))
    return new Response(JSON.stringify({ key: 'sk-or-v1-live' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl, bodies }
}

function callbackOf(authUrl: string) {
  return new URL(new URL(authUrl).searchParams.get('callback_url') ?? '')
}

/**
 * Plays the browser and OpenRouter. It keeps each auth URL. With `redirect`,
 * it changes the callback URL the way OpenRouter does (adds `?code=`), then
 * visits it and keeps the page text.
 */
function fakeBrowser(redirect?: (callback: URL) => void) {
  const authUrls: Array<string> = []
  const pages: Array<Promise<string>> = []
  const open = (authUrl: string) => {
    authUrls.push(authUrl)
    if (!redirect) return
    const callback = callbackOf(authUrl)
    redirect(callback)
    pages.push(fetch(callback).then((response) => response.text()))
  }
  return { open, authUrls, pages }
}

/** The listener is closed when a new request to its callback URL cannot connect. */
async function expectListenerClosed(authUrl: string | undefined) {
  expect(authUrl).toBeDefined()
  await expect(fetch(callbackOf(authUrl ?? ''))).rejects.toThrow('fetch failed')
}

describe('openrouterSignIn', () => {
  it('gets a key through a one-time listener on 127.0.0.1', async () => {
    const { fetchImpl, bodies } = keyEndpoint()
    const browser = fakeBrowser((callback) => {
      callback.searchParams.set('code', 'abc')
    })

    const key = await openrouterSignIn({ fetchImpl })({ open: browser.open })

    expect(key).toBe('sk-or-v1-live')
    const [authUrl] = browser.authUrls
    expect(callbackOf(authUrl ?? '').hostname).toBe('127.0.0.1')
    expect(bodies).toEqual([
      {
        code: 'abc',
        code_verifier: expect.any(String),
        code_challenge_method: 'S256',
      },
    ])
    // RFC 7636 S256: the challenge in the auth URL is base64url(sha256(verifier)).
    const verifier = bodies[0]?.code_verifier ?? ''
    expect(new URL(authUrl ?? '').searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    )
    expect(await browser.pages[0]).toContain('You can close this tab')
    await expectListenerClosed(authUrl)
  })

  it('rejects a callback with the wrong state', async () => {
    const { fetchImpl, bodies } = keyEndpoint()
    const browser = fakeBrowser((callback) => {
      callback.pathname = '/callback/forged'
      callback.searchParams.set('code', 'abc')
    })

    await expect(
      openrouterSignIn({ fetchImpl })({ open: browser.open }),
    ).rejects.toThrow('the state does not match')
    expect(bodies).toEqual([])
  })

  it('rejects when the browser does not come back in time', async () => {
    const browser = fakeBrowser()

    await expect(
      openrouterSignIn({ timeoutMs: 20 })({ open: browser.open }),
    ).rejects.toThrow('OpenRouter sign-in timed out')
  })

  it('rejects on abort and closes the listener', async () => {
    const controller = new AbortController()
    const browser = fakeBrowser()

    await expect(
      openrouterSignIn()({
        open: (authUrl) => {
          browser.open(authUrl)
          controller.abort()
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expectListenerClosed(browser.authUrls[0])
  })
})
