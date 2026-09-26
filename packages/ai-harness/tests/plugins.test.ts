import { describe, expect, it } from 'vitest'
import { createCapability, defineAgent } from '@tanstack/ai'
import { AgentRegistry } from '../src/agents'
import { definePlugin, mountPlugins } from '../src/plugins'
import { ResourceScope } from '../src/resources'

const env = () => ({
  threadId: 't1',
  registry: new AgentRegistry(),
  harnessTools: [],
  harnessProvides: [],
})

describe('ResourceScope', () => {
  it('closes resources newest first and reports every close error', async () => {
    const scope = new ResourceScope()
    const log: Array<string> = []
    await scope.acquire(
      () => 'a',
      () => log.push('close a'),
    )
    await scope.acquire(
      () => 'b',
      () => {
        log.push('close b')
        throw new Error('b broke')
      },
    )
    await scope.acquire(
      () => 'c',
      () => {
        log.push('close c')
        throw new Error('c broke')
      },
    )
    await expect(scope.dispose()).rejects.toBeInstanceOf(AggregateError)
    expect(log).toEqual(['close c', 'close b', 'close a'])
    expect(scope.signal.aborted).toBe(true)
  })

  it('closes a resource that finishes opening after dispose', async () => {
    const scope = new ResourceScope()
    const log: Array<string> = []
    let finishOpen!: () => void
    const opening = scope.acquire(
      () =>
        new Promise<string>((resolve) => {
          finishOpen = () => resolve('late')
        }),
      () => log.push('closed late'),
    )
    const disposed = scope.dispose()
    finishOpen()
    await expect(opening).rejects.toThrow('Resource scope disposed')
    await disposed
    expect(log).toEqual(['closed late'])
    await expect(
      scope.acquire(
        () => 'x',
        () => {},
      ),
    ).rejects.toThrow()
  })
})

describe('mountPlugins', () => {
  const store = createCapability<{ items: Array<string> }>()('test.store')

  it('fails before any setup when a required capability has no provider', async () => {
    let ran = false
    const reader = definePlugin({
      name: 'test/reader',
      requires: [store],
      setup: () => {
        ran = true
      },
    })
    await expect(mountPlugins([reader], env())).rejects.toThrow(
      'requires capability "test.store"',
    )
    expect(ran).toBe(false)
  })

  it('lets a later plugin read what an earlier plugin provides', async () => {
    const provider = definePlugin({
      name: 'test/provider',
      provides: [store],
      setup: ({ provide }) => provide(store, { items: ['x'] }),
    })
    let read: Array<string> = []
    const reader = definePlugin({
      name: 'test/reader',
      requires: [store],
      setup: ({ get }) => {
        read = get(store).items
      },
    })
    const mounted = await mountPlugins([provider, reader], env())
    expect(read).toEqual(['x'])
    expect(mounted.capabilityBridge?.provides).toEqual([store])
  })

  it('rejects a provide that the plugin did not declare', async () => {
    const sneaky = definePlugin({
      name: 'test/sneaky',
      setup: ({ provide }) => provide(store, { items: [] }),
    })
    await expect(mountPlugins([sneaky], env())).rejects.toThrow(
      'without declaring it in provides',
    )
  })

  it('disposes earlier plugins newest first when a setup throws', async () => {
    const log: Array<string> = []
    const opener = (name: string) =>
      definePlugin({
        name,
        setup: async ({ resources }) => {
          await resources.acquire(
            () => name,
            () => log.push(`close ${name}`),
          )
        },
      })
    const broken = definePlugin({
      name: 'test/broken',
      setup: () => {
        throw new Error('setup failed')
      },
    })
    await expect(
      mountPlugins([opener('test/one'), opener('test/two'), broken], env()),
    ).rejects.toThrow('setup failed')
    expect(log).toEqual(['close test/two', 'close test/one'])
  })

  it('checks needs.produces against the agents after setup', async () => {
    const needsImages = definePlugin({
      name: 'test/gallery',
      needs: { produces: ['image'] },
    })
    await expect(mountPlugins([needsImages], env())).rejects.toThrow(
      'needs an agent that produces "image"',
    )

    const painter = defineAgent({
      name: 'painter',
      description: 'Paints',
      produces: 'image',
      run: async () => 'painted',
    })
    const withPainter = definePlugin({
      name: 'test/painter',
      setup: () => ({ agents: [painter] }),
    })
    const environment = env()
    await mountPlugins([withPainter, needsImages], environment)
    expect(environment.registry.find({ produces: 'image' })).toBe(painter)
  })

  it('rejects duplicate plugin names', async () => {
    const a = definePlugin({ name: 'test/same' })
    await expect(mountPlugins([a, a], env())).rejects.toThrow(
      'Duplicate plugin: test/same',
    )
  })
})
