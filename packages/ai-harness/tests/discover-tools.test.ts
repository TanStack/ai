import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  startLoopbackReceiver,
} from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { SessionEvent } from '../src'

const echoTool = (name: string, reply: string) =>
  toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => reply)

describe('discoverTools', () => {
  it('adds tools a plugin finds at run time, skips taken names, and warns on failure', async () => {
    let online = false
    const connector = definePlugin({
      name: 'test/connector',
      setup: () => ({
        discoverTools: () =>
          online
            ? [
                echoTool('remote_search', 'remote result'),
                echoTool('lookup', 'shadowed'),
              ]
            : [],
      }),
    })
    const broken = definePlugin({
      name: 'test/broken',
      setup: () => ({
        discoverTools: async () => {
          throw new Error('server is down')
        },
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => text('nothing yet'),
      () => toolCall('remote_search', {}),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/discover',
        adapter,
        tools: [echoTool('lookup', 'local result')],
        plugins: () => [connector, broken],
      }),
      { threadId: 't' },
    )
    const names = (call: number) =>
      (calls[call].tools ?? []).map((tool: { name: string }) => tool.name)

    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal }))
        seen.push(entry)
    })()

    await session.prompt('before sign-in')
    expect(names(0)).toEqual(['lookup'])

    online = true
    const turn = await session.prompt('after sign-in')
    expect(turn.text).toBe('done')
    // The static `lookup` wins over the discovered one with the same name.
    expect(names(1)).toEqual(['lookup', 'remote_search'])
    expect(JSON.stringify(calls[2].messages)).toContain('remote result')

    controller.abort()
    await reading
    const warnings = seen.filter(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === 'harness.plugin.warning',
    )
    expect(warnings[0]?.event).toMatchObject({
      value: { plugin: 'test/broken', message: 'server is down' },
    })
    await host.close()
  })
})

describe('the default agent loop', () => {
  it('keeps calling the model past five steps', async () => {
    const steps = Array.from(
      { length: 7 },
      (_, index) => () => toolCall('lookup', {}, `call-${index}`),
    )
    const { adapter, calls } = mockAdapter([...steps, () => text('finally')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/long-turn',
        adapter,
        tools: [echoTool('lookup', 'fact')],
      }),
      { threadId: 't' },
    )
    const turn = await session.prompt('dig deep')
    expect(calls).toHaveLength(8)
    expect(turn.text).toBe('finally')
    await host.close()
  })
})

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
    expect(await code).toBe('abc')
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
