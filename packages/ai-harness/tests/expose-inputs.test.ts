import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  applyInput,
  configOption,
  createHarnessHandler,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessClient } from '../src/client'
import { permissions } from '../src/first-party'
import { mockAdapter } from './helpers'
import type { HarnessSession } from '../src'

async function open(expose?: {
  config?: Array<string>
  commands?: Array<string>
}) {
  const harness = defineHarness({
    name: 'test/expose-inputs',
    adapter: mockAdapter([]).adapter,
    plugins: () => [permissions()],
    ...(expose ? { expose } : {}),
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, { threadId: 't' })
  return { host, harness, session }
}

/** The `mode` setting of `permissions()`, as the session has it now. */
const modeOf = (session: HarnessSession) =>
  session.describe().config.find((entry) => entry.key === 'mode')?.value

describe('client config and command inputs', () => {
  it('refuses a config key that is not exposed, and the mode stays', async () => {
    const { host, harness, session } = await open()

    const receipt = await applyInput(harness, session, {
      op: 'config',
      key: 'mode',
      value: 'bypass',
      inputId: 'c-1',
    })

    expect(receipt).toEqual({
      inputId: 'c-1',
      status: 'rejected',
      reason: 'not_exposed',
    })
    expect(modeOf(session)).toBe('default')
    await host.close()
  })

  it('sets an exposed config key', async () => {
    const { host, harness, session } = await open({ config: ['mode'] })

    const receipt = await applyInput(harness, session, {
      op: 'config',
      key: 'mode',
      value: 'plan',
    })

    expect(receipt.status).toBe('accepted')
    expect(modeOf(session)).toBe('plan')
    await host.close()
  })

  it('refuses a command that is not exposed, and the command does not run', async () => {
    const { host, harness, session } = await open({ commands: ['undo'] })

    const receipt = await applyInput(harness, session, {
      op: 'command',
      name: 'mode',
      input: 'bypass',
    })

    expect(receipt).toEqual({
      inputId: '',
      status: 'rejected',
      reason: 'not_exposed',
    })
    expect(modeOf(session)).toBe('default')
    await host.close()
  })

  it('runs an exposed command', async () => {
    const { host, harness, session } = await open({ commands: ['mode'] })

    const receipt = await applyInput(harness, session, {
      op: 'command',
      name: 'mode',
      input: 'plan',
    })

    expect(receipt.status).toBe('accepted')
    await expect(session.operation(receipt.operationId ?? '')).resolves.toBe(
      'Mode: plan.',
    )
    expect(modeOf(session)).toBe('plan')
    await host.close()
  })

  it('lets server code set every key and run every command', async () => {
    const { host, session } = await open()

    expect((await session.setConfig('mode', 'plan')).status).toBe('accepted')
    expect(modeOf(session)).toBe('plan')
    expect(await session.command('mode', 'acceptEdits')).toBe(
      'Mode: acceptEdits.',
    )
    expect(modeOf(session)).toBe('acceptEdits')
    await host.close()
  })
})

describe('describe for a client', () => {
  it('lists only the exposed commands and config keys over HTTP, and all of them on the server', async () => {
    const twoOfEach = definePlugin({
      name: 'test/two-of-each',
      setup: () => ({
        config: {
          tone: configOption.text({ default: 'plain' }),
          secret: configOption.text({ default: 'hidden' }),
        },
        commands: {
          ping: defineCommand({ description: 'Ping', run: async () => 'pong' }),
          wipe: defineCommand({ description: 'Wipe', run: async () => 'gone' }),
        },
      }),
    })
    const harness = defineHarness({
      name: 'test/expose-describe',
      adapter: mockAdapter([]).adapter,
      plugins: () => [twoOfEach],
      expose: { config: ['tone'], commands: ['ping'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const described = await client.describe()

    expect(described.commands.map(({ name }) => name)).toEqual(['ping'])
    expect(described.config.map(({ key }) => key)).toEqual(['tone'])
    const session = await host.open(harness, { threadId: 't' })
    const full = session.describe()
    expect(full.commands.map(({ name }) => name)).toEqual(['ping', 'wipe'])
    expect(full.config.map(({ key }) => key)).toEqual(['tone', 'secret'])
    await host.close()
  })
})
