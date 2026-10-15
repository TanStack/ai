import { describe, expect, it } from 'vitest'
import { startLoopbackReceiver } from '../src'

describe('startLoopbackReceiver', () => {
  it('returns the code for the matching state and ignores other paths', async () => {
    const receiver = await startLoopbackReceiver()
    expect(receiver.redirectUri).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    )
    const code = receiver.waitForCode('s1')
    const other = await fetch(
      receiver.redirectUri.replace('/callback', '/favicon.ico'),
    )
    expect(other.status).toBe(404)
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
})
