import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
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
 * model starts subagents with the single `subagent` tool.
 */
async function open(adapter: AnyTextAdapter, plugins: Array<HarnessPlugin>) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/agents',
      adapter,
      tools: [tool('read_file'), tool('write_file')],
      subagents: { agents: [], tool: 'single' },
      plugins: () => plugins,
    }),
    { threadId: 't' },
  )
  return { host, session }
}

/** The names of the tools the model got on one call. */
function toolNames(call: { tools: Array<{ name: string }> }) {
  return call.tools.map((entry) => entry.name)
}

/** The parts of the `subagent` tool these tests read. */
interface SubagentTool {
  name: string
  description: string
  inputSchema: { properties: { agent: { enum: Array<string> } } }
}

/** The `subagent` tool the model got on one call. */
function subagentTool(call: { tools: Array<SubagentTool> }) {
  return call.tools.find((entry) => entry.name === 'subagent')
}

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

    expect(await session.command('agent')).toBe(
      'Agent: build. Agents: build, plan.',
    )
    await session.prompt('hi')

    expect(subagentTool(calls[0])?.inputSchema.properties.agent.enum).toEqual([
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

    await session.prompt('build it')
    expect(await session.command('agent', 'plan')).toBe(
      'Agent: plan. It applies at the next turn.',
    )
    await session.prompt('plan it')

    expect(toolNames(calls[0])).toEqual(['read_file', 'write_file', 'subagent'])
    expect(toolNames(calls[1])).toEqual(['read_file'])
    expect(promptsOf(calls[1])).toContain('You are the plan agent.')
    expect(promptsOf(calls[1])).not.toContain('You are the build agent.')
    expect(await session.command('agent', 'nope')).toBe(
      'Unknown agent "nope". Agents: build, plan.',
    )
    await host.close()
  })

  it('switches the primary agent with the agent setting', async () => {
    const { adapter, calls } = mockAdapter([() => text('planned')])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter }),
    ])

    expect((await session.setConfig('agent', 'plan')).status).toBe('accepted')
    // A subagent is not a primary agent.
    expect((await session.setConfig('agent', 'general')).status).toBe(
      'rejected',
    )
    await session.prompt('plan it')

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

    expect(await session.prompt('one')).toEqual({ text: 'from main' })
    await session.command('agent', 'quick')
    expect(await session.prompt('two')).toEqual({ text: 'from fast' })
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

    await session.prompt('go')

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

    await session.prompt('go')

    // The run ends after the last call, and only the first call ran.
    expect(calls).toHaveLength(2)
    expect(calls[1].toolChoice).toBe('none')
    expect(ran).toEqual(['read_file'])

    // The next turn shows the model the refusal of the last call.
    await session.prompt('and now?')
    const refused = calls[2].messages.find(
      (message: { role: string; toolCallId?: string }) =>
        message.role === 'tool' && message.toolCallId === 'c2',
    )
    expect(JSON.stringify(refused?.content)).toContain('Step limit reached')
    expect(ran).toEqual(['read_file'])
    await host.close()
  })

  it('runs a subagent agent as a child of the subagent tool', async () => {
    const lead = mockAdapter([
      () =>
        toolCall('subagent', { agent: 'explore', prompt: 'Find the config' }),
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

    await session.prompt('Where is the config?')

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

    await session.command('agent', 'careful')
    await session.prompt('one')
    await session.command('agent', 'build')
    await session.prompt('two')

    expect(toolNames(calls[0])).toEqual(['read_file', 'subagent'])
    expect(toolNames(calls[1])).toEqual(['read_file', 'write_file', 'subagent'])
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

    expect(await session.command('agent')).toBe(
      'Agent: build. Agents: build, plan.',
    )
    await session.command('agent', 'plan')
    await session.prompt('plan it')

    expect(toolNames(calls[0])).toEqual(['read_file', 'write_file', 'subagent'])
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

    expect(await session.command('agent')).toBe('Agent: solo. Agents: solo.')
    await session.prompt('hi')

    expect(toolNames(calls[0])).toEqual(['read_file', 'write_file'])
    await host.close()
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

    expect(await session.command('agent')).toBe(
      'Agent: build. Agents: build, plan, reviewer.',
    )
    await session.prompt('build it')
    expect(subagentTool(main.calls[0])?.description).toContain(
      '- reviewer: Reviews code',
    )
    await session.command('agent', 'reviewer')
    await session.prompt('review it')

    expect(toolNames(smart.calls[0])).toEqual(['read_file'])
    expect(promptsOf(smart.calls[0])).toContain('You review code.')
    expect(smart.calls.map((call) => call.toolChoice)).toEqual([
      undefined,
      'none',
    ])
    await host.close()
  })

  it('reads the folder again on session.reload()', async () => {
    const { adapter } = mockAdapter([])
    const { host, session } = await open(adapter, [
      agents({ adapter: () => adapter, dirs: [root] }),
    ])
    expect(await session.command('agent')).toBe(
      'Agent: build. Agents: build, plan.',
    )

    await writeFile(join(root, 'writer.md'), 'You write docs.')
    await session.reload()

    expect(await session.command('agent')).toBe(
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
