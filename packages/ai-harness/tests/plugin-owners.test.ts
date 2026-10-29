import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createCapability, defineAgent, toolDefinition } from '@tanstack/ai'
import { AgentRegistry } from '../src/agents'
import { defineCommand } from '../src/commands'
import { configOption } from '../src/config'
import { createExtensionPoint, createPluginEvent } from '../src/extensions'
import { definePlugin, mountPlugins } from '../src/plugins'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'
import type { MountedPlugins, PluginSetupContext } from '../src/plugins'

const env = () => ({
  threadId: 't1',
  registry: new AgentRegistry(),
  harnessTools: [],
  harnessProvides: [],
})

const Rules = createExtensionPoint<string>('test/rules')

const agentNamed = (name: string) =>
  defineAgent({ name, description: name, run: async () => name })

/** A plugin `id` that contributes one item of every kind, each named `id`. */
function contributor(id: string) {
  const capability = createCapability<string>()(`test/${id}-capability`)
  const pick = () => undefined
  const plugin = definePlugin({
    name: id,
    provides: [capability],
    setup: ({ provide }) => {
      provide(capability, `${id} value`)
      return {
        tools: [
          toolDefinition({ name: `${id}_tool`, description: id }).server(
            () => id,
          ),
        ],
        prompts: [
          `${id} prompt`,
          { id: `${id}:context`, text: `${id} context`, placement: 'context' },
        ],
        middleware: [{ name: `${id}-middleware` }],
        agentMiddleware: [{ name: `${id}-agent-middleware` }],
        generationMiddleware: [{ name: `${id}-generation-middleware` }],
        agents: [agentNamed(`${id}-agent`)],
        subagents: [agentNamed(`${id}-subagent`)],
        commands: {
          [`${id}-command`]: defineCommand({ description: id, run: () => id }),
        },
        config: {
          [`${id}-level`]: configOption.select({
            options: ['low', 'high'],
            default: 'low',
          }),
        },
        contribute: [Rules.item(`${id} rule`)],
        adapter: pick,
        discoverTools: () => [],
        prepareTools: ({ tools }) => tools,
      }
    },
  })
  return { plugin, capability, pick }
}

/** The name or value of every contribution in `mounted`. */
function contents(mounted: MountedPlugins) {
  const names = (items: ReadonlyArray<{ name?: string }>) =>
    items.map((item) => item.name)
  return {
    plugins: mounted.owners.plugins.map((plugin) => plugin.name),
    tools: names(mounted.tools),
    prompts: mounted.prompts,
    contextPrompts: mounted.contextPrompts.map((item) => item.text),
    middleware: names(mounted.middleware),
    agentMiddleware: names(mounted.agentMiddleware),
    generationMiddleware: names(mounted.generationMiddleware),
    agents: names(mounted.agents),
    subagents: names(mounted.subagents),
    commands: [...mounted.commands.keys()],
    config: [...mounted.config.keys()],
    rules: (mounted.extensions.get(Rules.name) ?? []).map((item) => item.value),
    adapters: mounted.adapters,
    discoverers: mounted.discoverers.map((item) => item.owner),
    preparers: mounted.preparers.map((item) => item.owner),
    capabilities: mounted.capabilityBridge?.provides ?? [],
  }
}

describe('MountedPlugins.withoutOwners', () => {
  it('removes every kind of contribution of a plugin and keeps the others', async () => {
    const a = contributor('a')
    const b = contributor('b')
    const mounted = await mountPlugins([a.plugin, b.plugin], env())

    const kept = mounted.withoutOwners(['a'])

    expect(contents(kept)).toEqual({
      plugins: ['b'],
      tools: ['b_tool'],
      prompts: ['b prompt'],
      contextPrompts: ['b context'],
      middleware: ['b-middleware'],
      agentMiddleware: ['b-agent-middleware'],
      generationMiddleware: ['b-generation-middleware'],
      agents: ['b-agent'],
      subagents: ['b-subagent'],
      commands: ['b-command'],
      config: ['b-level'],
      rules: ['b rule'],
      adapters: [b.pick],
      discoverers: ['b'],
      preparers: ['b'],
      capabilities: [b.capability],
    })
    expect(kept.values.get(a.capability)).toBeUndefined()
    expect(kept.values.get(b.capability)).toBe('b value')
    // The mounted set itself keeps both plugins.
    expect(contents(mounted).agents).toEqual(['a-agent', 'b-agent'])
    expect(mounted.values.get(a.capability)).toBe('a value')
  })

  it('removes an agent that a plugin set after the mount', async () => {
    let saved: PluginSetupContext | undefined
    const late = definePlugin({
      name: 'late',
      setup: (ctx) => {
        saved = ctx
      },
    })
    const mounted = await mountPlugins([late, contributor('b').plugin], env())
    saved?.agents.set(agentNamed('late-subagent'), { subagent: true })

    expect(contents(mounted).subagents).toEqual(['b-subagent', 'late-subagent'])
    expect(contents(mounted.withoutOwners(['late'])).subagents).toEqual([
      'b-subagent',
    ])
  })

  it('reads the commands and agents that a kept plugin sets after the copy', async () => {
    let saved: PluginSetupContext | undefined
    const late = definePlugin({
      name: 'late',
      setup: (ctx) => {
        saved = ctx
      },
    })
    const mounted = await mountPlugins([late, contributor('b').plugin], env())
    const kept = mounted.withoutOwners(['b'])

    saved?.commands.set(
      'deploy',
      defineCommand({ description: 'Deploy', run: () => 'deployed' }),
    )
    saved?.agents.set(agentNamed('late-subagent'), { subagent: true })

    expect(contents(kept).commands).toEqual(['deploy'])
    expect(contents(kept).subagents).toEqual(['late-subagent'])
    saved?.commands.delete('deploy')
    expect(contents(kept).commands).toEqual([])
  })

  it('refuses to remove a plugin whose capability a kept plugin requires', async () => {
    const a = contributor('a')
    const reader = definePlugin({
      name: 'reader',
      requires: [a.capability],
    })
    const mounted = await mountPlugins([a.plugin, reader], env())

    expect(() => mounted.withoutOwners(['a'])).toThrow(
      'Cannot remove plugin a: plugin reader requires its capability "test/a-capability".',
    )
    expect(contents(mounted.withoutOwners(['a', 'reader'])).plugins).toEqual([])
  })
})

describe('ctx.on', () => {
  it('leaves no abort listener on the plugin signal after off()', async () => {
    let saved: PluginSetupContext | undefined
    const listener = definePlugin({
      name: 'listener',
      setup: (ctx) => {
        saved = ctx
      },
    })
    await mountPlugins([listener], env())
    if (!saved) throw new Error('setup did not run')
    const signal = saved.resources.signal
    const add = vi.spyOn(signal, 'addEventListener')
    const removeListener = vi.spyOn(signal, 'removeEventListener')
    const ping = createPluginEvent<string>('test/ping')

    for (let index = 0; index < 3; index++) {
      saved.on(ping, () => {})()
    }

    const added = add.mock.calls.map((call) => call[1])
    const removed = removeListener.mock.calls.map((call) => call[1])
    expect(added).toHaveLength(3)
    expect(added.filter((item) => !removed.includes(item))).toEqual([])
  })
})

describe('a thread that removes a plugin', () => {
  it('does not run an agent of that plugin by name', async () => {
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: async () => 'worked',
    })
    const plugin = definePlugin({
      name: 'test/workers',
      setup: () => ({ agents: [worker] }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/plugin-owners',
        adapter: mockAdapter(() => text('ok')).adapter,
        plugins: () => [plugin],
      }),
      { threadId: 't' },
    )
    const byName = session.agent('worker')
    expect(await byName?.run()).toBe('worked')

    await session.updateThreadSettings({
      settings: { plugins: { remove: ['test/workers'] } },
    })

    expect(session.agent('worker')).toBeUndefined()
    await expect(byName?.start()).rejects.toThrow('Unknown agent: worker')
    await host.close()
  })
})
