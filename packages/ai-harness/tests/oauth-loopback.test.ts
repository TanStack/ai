import { afterEach, describe, expect, it, vi } from 'vitest'
import { startLoopbackReceiver } from '../src/oauth'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startLoopbackReceiver', () => {
  it('returns the code for the matching state and ignores other requests', async () => {
    const receiver = await startLoopbackReceiver()
    expect(receiver.redirectUri).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    )
    const code = receiver.waitForCode('s1')
    const other = await fetch(
      receiver.redirectUri.replace('/callback', '/favicon.ico'),
    )
    expect(other.status).toBe(404)
    // A callback with no code and no state is not the answer of the server.
    const stray = await fetch(receiver.redirectUri)
    expect(stray.status).toBe(400)
    const done = await fetch(`${receiver.redirectUri}?code=abc&state=s1`)
    expect(done.status).toBe(200)
    expect(await done.text()).toContain('signed in')
    expect(await code).toEqual({ code: 'abc' })
  })

  it('returns the issuer the server sent with the code (RFC 9207)', async () => {
    const receiver = await startLoopbackReceiver()
    const code = receiver.waitForCode('s1')
    const issuer = encodeURIComponent('https://mcp.linear.app')
    await fetch(`${receiver.redirectUri}?code=abc&state=s1&iss=${issuer}`)
    expect(await code).toEqual({ code: 'abc', iss: 'https://mcp.linear.app' })
  })

  it('refuses a callback with the wrong state', async () => {
    const receiver = await startLoopbackReceiver()
    const code = receiver.waitForCode('expected')
    const rejected = expect(code).rejects.toThrow('the state does not match')
    await fetch(`${receiver.redirectUri}?code=abc&state=other`)
    await rejected
  })

  it('reports the error the server sent back', async () => {
    const receiver = await startLoopbackReceiver()
    const code = receiver.waitForCode('s')
    const rejected = expect(code).rejects.toThrow(
      'Sign-in failed: access_denied',
    )
    await fetch(`${receiver.redirectUri}?error=access_denied&state=s`)
    await rejected

    const bare = await startLoopbackReceiver()
    const noCode = bare.waitForCode('s')
    const missing = expect(noCode).rejects.toThrow('Sign-in failed: no code')
    await fetch(`${bare.redirectUri}?state=s`)
    await missing
  })

  it('times out and stops listening', async () => {
    const receiver = await startLoopbackReceiver({ timeoutMs: 20 })
    await expect(receiver.waitForCode('s')).rejects.toThrow(
      'Sign-in timed out.',
    )
    await expect(fetch(receiver.redirectUri)).rejects.toThrow()
    receiver.close()
  })

  it('rejects the waiting waitForCode on close, and stops listening', async () => {
    const receiver = await startLoopbackReceiver()
    const code = receiver.waitForCode('s')
    receiver.close()
    await expect(code).rejects.toThrow('Sign-in cancelled.')
    await expect(fetch(receiver.redirectUri)).rejects.toThrow()
  })

  it('stops at once with the reason of the signal', async () => {
    const controller = new AbortController()
    const reason = new Error('The user left.')
    const receiver = await startLoopbackReceiver({ signal: controller.signal })
    const code = receiver.waitForCode('s')
    controller.abort(reason)
    await expect(code).rejects.toBe(reason)
    await expect(fetch(receiver.redirectUri)).rejects.toThrow()
    // A signal that aborted before the start opens no receiver.
    await expect(
      startLoopbackReceiver({ signal: controller.signal }),
    ).rejects.toBe(reason)
  })

  it('does not let its deadline keep the process alive', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const receiver = await startLoopbackReceiver()
    const code = receiver.waitForCode('s')
    const deadline = timers.mock.results.at(-1)?.value
    expect(deadline?.hasRef()).toBe(false)
    receiver.close()
    await expect(code).rejects.toThrow('Sign-in cancelled.')
  })
})
