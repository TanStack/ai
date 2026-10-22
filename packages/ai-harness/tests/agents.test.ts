import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { permissions } from '../src/first-party'
import { agents } from '../src/first-party/agents'
import { splitFrontmatter } from '../src/first-party/files'
import { messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessPlugin } from '../src'
import type { AgentProfile } from '../src/first-party/agents'

/** The names of the tools that ran, in order. */
const ran: Array<string> = []

beforeEach(() => {
  ran.length = 0
})

const tool = (name: string) =>
  toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => {
    ran.push(name)
    return name
  })

/**
 * Open thread `t` with the tools `read_file` and `write_file`. The main
 * model starts each subagent with a tool named after it.
 */
async function open(adapter: AnyTextAdapter, plugins: Array<HarnessPlugin>) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/agents',
      adapter,
      tools: [tool('read_file'), tool('write_file')],
      plugins: () => plugins,
    }),
    {
      threadId: 't',
    },
  )
  return { host, session }
}

/** The names of the tools the model got on one call. */
function toolNames(call: { tools: Array<{ name: string }> }) {
  return call.tools.map((entry) => entry.name)
}

/** The names of the tools a subagent got on one call, also when none. */
function childTools(call: { tools?: Array<{ name: string }> }) {
  return (call.tools ?? []).map((entry) => entry.name)
}

/** A subagent with its own model, and every tool of the turn. */
const helper: AgentProfile = {
  name: 'helper',
  description: 'Helps with a task',
  mode: 'subagent',
  model: 'child-model',
}

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

/** The system prompts of one call, as one string. */
function promptsOf(call: { systemPrompts: unknown }) {
  return JSON.stringify(call.systemPrompts)
}

describe('splitFrontmatter', () => {
  it('reads values and both list forms', () => {
    const file = [
      '---',
      'description: "Reviews: code"',
      'tools: [read_file, grep]',
      'models:',
      '  - fast',
      "  - 'smart'",
      '---',
      'Body',
    ].join('\n')
    expect(splitFrontmatter(file)).toEqual({
      fields: {
        description: 'Reviews: code',
        tools: ['read_file', 'grep'],
        models: ['fast', 'smart'],
      },
      body: 'Body',
    })
  })

  it('keeps a file without frontmatter as the body', () => {
    expect(splitFrontmatter('Just text')).toEqual({
      fields: {},
      body: 'Just text',
    })
  })
})

describe('agents', () => {
  it('offers build and plan as primary agents, and general and explore as subagents', async () => {
    const { adapter, calls } = mockAdapter([() => text('hi')])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter }),
    ])

    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: build. Agents: build, plan.',
    )
    await session.send('hi')

    expect(toolNames(calls[0])).toEqual([
      'read_file',
      'write_file',
      'general',
      'explore',
    ])
    expect(promptsOf(calls[0])).toContain('You are the build agent.')
    await host.close()
  })

  it('switches to plan with /agent: the next turn gets its prompt and read-only tools', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('built'),
      () => text('planned'),
    ])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter }),
    ])

    await session.send('build it')
    expect(await session.runCommand({ name: 'agent', input: 'plan' })).toBe(
      'Agent: plan. It applies at the next turn.',
    )
    await session.send('plan it')

    expect(toolNames(calls[0])).toEqual([
      'read_file',
      'write_file',
      'general',
      'explore',
    ])
    expect(toolNames(calls[1])).toEqual(['read_file'])
    expect(promptsOf(calls[1])).toContain('You are the plan agent.')
    expect(promptsOf(calls[1])).not.toContain('You are the build agent.')
    expect(await session.runCommand({ name: 'agent', input: 'nope' })).toBe(
      'Unknown agent "nope". Agents: build, plan.',
    )
    await host.close()
  })

  it('switches the primary agent with the agent setting', async () => {
    const { adapter, calls } = mockAdapter([() => text('planned')])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter }),
    ])

    expect(
      (await session.setPluginSetting({ key: 'agent', value: 'plan' })).status,
    ).toBe('accepted')
    // A subagent is not a primary agent.
    expect(
      (await session.setPluginSetting({ key: 'agent', value: 'general' }))
        .status,
    ).toBe('rejected')
    await session.send('plan it')

    expect(toolNames(calls[0])).toEqual(['read_file'])
    await host.close()
  })

  it('switches the model when the agent has one, and keeps the harness model when not', async () => {
    const main = mockAdapter([() => text('from main')])
    const fast = mockAdapter([() => text('from fast')])
    const byModel = (model: string) => {
      if (model !== 'fast-model') throw new Error(`Unknown model ${model}`)
      return fast.adapter
    }
    const quick: AgentProfile = {
      name: 'quick',
      description: 'Answers fast',
      mode: 'primary',
      model: 'fast-model',
    }
    const { host, session } = await open(main.adapter, [
      agents({ adapter: byModel, agents: [quick] }),
    ])

    expect(await session.send('one')).toEqual({
      text: 'from main',
      media: [],
    })
    await session.runCommand({ name: 'agent', input: 'quick' })
    expect(await session.send('two')).toEqual({
      text: 'from fast',
      media: [],
    })
    await host.close()
  })

  it('makes the call after `steps` model calls with no tool calls, then stops', async () => {
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', {}, 'c1'),
      () => toolCall('read_file', {}, 'c2'),
      () => toolCall('read_file', {}, 'c3'),
      () => text('never asked'),
    ])
    const short: AgentProfile = {
      name: 'short',
      description: 'Two steps',
      mode: 'primary',
      steps: 2,
    }
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter, agents: [short], default: 'short' }),
    ])

    await session.send('go')

    expect(calls.map((call) => call.toolChoice)).toEqual([
      undefined,
      undefined,
      'none',
    ])
    expect(promptsOf(calls[1])).not.toContain('step limit')
    expect(promptsOf(calls[2])).toContain('step limit')
    await host.close()
  })

  it('refuses a tool call at the step limit when the provider ignores toolChoice', async () => {
    // Bedrock Converse sends `none` as `auto` after tool calls, so the model
    // can still call a tool on the last call.
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', {}, 'c1'),
      () => toolCall('read_file', {}, 'c2'),
      () => text('Here is what I have.'),
    ])
    const short: AgentProfile = {
      name: 'short',
      description: 'One step',
      mode: 'primary',
      steps: 1,
    }
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter, agents: [short], default: 'short' }),
    ])

    await session.send('go')

    // The run ends after the last call, and only the first call ran.
    expect(calls).toHaveLength(2)
    expect(calls[1].toolChoice).toBe('none')
    expect(ran).toEqual(['read_file'])

    // The next turn shows the model the refusal of the last call.
    await session.send('and now?')
    const refused = calls[2].messages.find(
      (message: { role: string; toolCallId?: string }) =>
        message.role === 'tool' && message.toolCallId === 'c2',
    )
    expect(JSON.stringify(refused?.content)).toContain('Step limit reached')
    expect(ran).toEqual(['read_file'])
    await host.close()
  })

  it('runs a subagent agent as a child of its tool', async () => {
    const lead = mockAdapter([
      () => toolCall('explore', { prompt: 'Find the config' }),
      () => text('Done.'),
    ])
    const child = mockAdapter(() => text('It is in config.ts'))
    const models: Array<string> = []
    const { host, session } = await open(lead.adapter, [
      agents({
        adapter: (model) => {
          models.push(model)
          return child.adapter
        },
      }),
    ])

    await session.send('Where is the config?')

    // Without its own model, the child uses the model of the main turn.
    expect(models).toEqual(['test-model'])
    expect(toolNames(child.calls[0])).toEqual(['read_file'])
    expect(promptsOf(child.calls[0])).toContain('You are a fast search agent.')
    expect(messageTexts(child.calls[0]).at(-1)).toBe('Find the config')
    expect(JSON.stringify(lead.calls[1].messages)).toContain(
      'It is in config.ts',
    )
    await host.close()
  })

  it('applies the permission rules of an agent only while it is the primary agent', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('one'),
      () => text('two'),
    ])
    const careful: AgentProfile = {
      name: 'careful',
      description: 'Never writes',
      mode: 'primary',
      permissions: [{ tool: 'write_file', decision: 'deny' }],
    }
    const { host, session } = await open(adapter, [
      permissions(),
      agents({ adapter: () => adapter, agents: [careful] }),
    ])

    await session.runCommand({ name: 'agent', input: 'careful' })
    await session.send('one')
    await session.runCommand({ name: 'agent', input: 'build' })
    await session.send('two')

    expect(toolNames(calls[0])).toEqual(['read_file', 'general', 'explore'])
    expect(toolNames(calls[1])).toEqual([
      'read_file',
      'write_file',
      'general',
      'explore',
    ])
    await host.close()
  })

  it('gives a thread that removes agents() none of its subagents, rules, or commands', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('one'),
      () => text('two'),
    ])
    const careful: AgentProfile = {
      name: 'careful',
      description: 'Never writes',
      mode: 'primary',
      permissions: [{ tool: 'write_file', decision: 'deny' }],
    }
    const { host, session } = await open(adapter, [
      permissions(),
      agents({ adapter: () => adapter, agents: [careful], default: 'careful' }),
    ])

    await session.send('one')
    expect(
      await session.updateThreadSettings({
        settings: { plugins: { remove: ['tanstack/agents'] } },
      }),
    ).toMatchObject({ status: 'accepted' })
    await session.send('two')

    expect(toolNames(calls[0])).toEqual(['read_file', 'general', 'explore'])
    // No subagent tools, and the deny rule of `careful` is gone.
    expect(toolNames(calls[1])).toEqual(['read_file', 'write_file'])
    expect(session.commands().map((command) => command.name)).not.toContain(
      'agent',
    )
    await expect(
      session.runCommand({ name: 'agent', input: 'build' }),
    ).rejects.toThrow(/Unknown command: agent/)
    await host.close()
  })

  it('replaces a built-in agent with one of the same name', async () => {
    const { adapter, calls } = mockAdapter([() => text('planned')])
    const plan: AgentProfile = {
      name: 'plan',
      description: 'My plan',
      mode: 'primary',
      system: 'My own plan prompt.',
    }
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter, agents: [plan] }),
    ])

    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: build. Agents: build, plan.',
    )
    await session.runCommand({ name: 'agent', input: 'plan' })
    await session.send('plan it')

    expect(toolNames(calls[0])).toEqual([
      'read_file',
      'write_file',
      'general',
      'explore',
    ])
    expect(promptsOf(calls[0])).toContain('My own plan prompt.')
    await host.close()
  })

  it('drops the built-ins, and leaves hidden agents out of the list', async () => {
    const { adapter, calls } = mockAdapter([() => text('hi')])
    const { host, session } = await open(adapter, [
      agents({
        adapter: () => adapter,
        builtIns: false,
        agents: [
          { name: 'solo', description: 'The only agent', mode: 'primary' },
          {
            name: 'secret',
            description: 'Not listed',
            mode: 'primary',
            hidden: true,
          },
        ],
      }),
    ])

    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: solo. Agents: solo.',
    )
    await session.send('hi')

    expect(toolNames(calls[0])).toEqual(['read_file', 'write_file'])
    await host.close()
  })
  it("gives a subagent the tools of the turn that started it, never another user's", async () => {
    // Each turn finds one tool of its user, as a sign-in to a server does.
    const secrets = definePlugin({
      name: 'test/secrets',
      setup: () => ({
        discoverTools: (turn) => [tool(`secret_${turn.user?.id}`)],
      }),
    })
    const lead = mockAdapter([
      () => toolCall('helper', { prompt: 'Help.' }),
      () => text('Olga is done.'),
      () => text('Bea is done.'),
    ])
    const child = mockAdapter(() => text('Helped.'))
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/agents',
      adapter: lead.adapter,
      tools: [tool('read_file')],
      plugins: () => [
        secrets,
        agents({ adapter: () => child.adapter, agents: [helper] }),
      ],
    })
    const olga = await host.open(harness, {
      threadId: 't',
      user: { id: 'olga' },
    })
    const bea = await host.open(harness, {
      threadId: 't',
      user: { id: 'bea' },
    })

    await olga.send('Get help.')
    await bea.send('Hi.')
    // Code starts the agent after the turn of bea. No turn started it.
    await olga.agent('helper')?.start('Again.')

    expect(childTools(child.calls[0])).toEqual(['read_file', 'secret_olga'])
    expect(childTools(child.calls[1])).toEqual([])
    await host.close()
  })

  it('fails a subagent run whose turn ran on another host with a clear error', async () => {
    const persistence = memoryPersistence()
    const lead = mockAdapter([
      () => toolCall('helper', { prompt: 'Help.', background: true }),
      () => text('It runs.'),
    ])
    const child = mockAdapter(() => text('Helped.'))
    const harness = defineHarness({
      name: 'test/agents',
      adapter: lead.adapter,
      tools: [tool('read_file')],
      plugins: () => [
        agents({ adapter: () => child.adapter, agents: [helper] }),
      ],
    })
    const first = createHarnessHost({ persistence })
    const session = await first.open(harness, { threadId: 't' })
    await session.send('Start a helper.')
    await waitFor(() =>
      expect(session.agentRuns().map((run) => run.status)).toEqual([
        'completed',
      ]),
    )
    const [started] = session.agentRuns()
    await first.close()

    // Another host has no turn of this thread in its memory.
    const second = createHarnessHost({ persistence })
    const again = await second.open(harness, { threadId: 't' })
    const run = again.agentRun(started?.operationId ?? '')
    const receipt = await run?.send('Go on.', { mode: 'followUp' })

    await expect(again.operation(receipt?.operationId ?? '')).rejects.toThrow(
      'only in the memory of the host that ran that turn',
    )
    expect(child.calls).toHaveLength(1)
    await second.close()
  })
})

describe('agents from Markdown files', () => {
  let root = ''
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'harness-agents-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('loads an agent with its frontmatter fields', async () => {
    await writeFile(
      join(root, 'reviewer.md'),
      [
        '---',
        'description: Reviews code',
        'mode: all',
        'model: smart-model',
        'tools: [read_file]',
        'steps: 1',
        '---',
        'You review code.',
      ].join('\n'),
    )
    const main = mockAdapter([() => text('built')])
    const smart = mockAdapter([
      () => toolCall('read_file', {}, 'c1'),
      () => text('reviewed'),
    ])
    const { host, session } = await open(main.adapter, [
      agents({
        adapter: (model) =>
          model === 'smart-model' ? smart.adapter : main.adapter,
        dirs: [root],
      }),
    ])

    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: build. Agents: build, plan, reviewer.',
    )
    await session.send('build it')
    expect(
      main.calls[0].tools.find(
        (entry: { name: string }) => entry.name === 'reviewer',
      )?.description,
    ).toBe('Reviews code')
    await session.runCommand({ name: 'agent', input: 'reviewer' })
    await session.send('review it')

    expect(toolNames(smart.calls[0])).toEqual(['read_file'])
    expect(promptsOf(smart.calls[0])).toContain('You review code.')
    expect(smart.calls.map((call) => call.toolChoice)).toEqual([
      undefined,
      'none',
    ])
    await host.close()
  })

  it('reads the folder again on session.reloadPlugins()', async () => {
    const { adapter } = mockAdapter([])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter, dirs: [root] }),
    ])
    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: build. Agents: build, plan.',
    )

    await writeFile(join(root, 'writer.md'), 'You write docs.')
    await session.reloadPlugins()

    expect(await session.runCommand({ name: 'agent' })).toBe(
      'Agent: build. Agents: build, plan, writer.',
    )
    await host.close()
  })

  it('refuses an agent file with an unknown mode', async () => {
    await writeFile(join(root, 'bad.md'), '---\nmode: sometimes\n---\nText')
    const { adapter } = mockAdapter([])

    await expect(
      open(adapter, [agents({ adapter: () => adapter, dirs: [root] })]),
    ).rejects.toThrow('Agent file bad.md: "mode" is not valid.')
  })
})
