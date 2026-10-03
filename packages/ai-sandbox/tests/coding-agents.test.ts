import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { codingAgents } from '../src/harness'
import { defineSandbox } from '../src/sandbox'
import { defineWorkspace } from '../src/workspace'
import { makeFakeProvider } from './fakes'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

const now = () => Date.now()
// A small local project the sandboxes start from.
const project = mkdtempSync(join(tmpdir(), 'coding-agents-'))
writeFileSync(join(project, 'README.md'), '# demo\n')
const TYPES = {
  providerOptions: {} as Record<string, unknown>,
  inputModalities: ['text'] as readonly ['text'],
  messageMetadataByModality: {
    text: undefined as unknown,
    image: undefined as unknown,
    audio: undefined as unknown,
    video: undefined as unknown,
    document: undefined as unknown,
  },
  toolCapabilities: [] as ReadonlyArray<string>,
  toolCallMetadata: undefined as unknown,
  systemPromptMetadata: undefined as never,
}

function textChunks(content: string): Array<StreamChunk> {
  return [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `m-${content}`,
      role: 'assistant',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `m-${content}`,
      delta: content,
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `m-${content}`,
      timestamp: now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'stop' } },
    },
  ]
}

/** A lead model that calls the given tools in one step, then answers. */
function lead(steps: Array<Array<[string, string]>>) {
  let call = 0
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'lead',
    model: 'lead',
    '~types': TYPES,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: () => {
      const step = steps[call]
      call += 1
      return (async function* (): AsyncGenerator<StreamChunk> {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        if (!step) {
          yield* textChunks('lead done')
          return
        }
        for (const [index, [tool, task]] of step.entries()) {
          const id = `call-${call}-${index}`
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: id,
            toolCallName: tool,
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: id,
            delta: JSON.stringify({ task }),
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: id,
            timestamp: now(),
          }
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        }
      })()
    },
  }
  return adapter
}

/**
 * A stand-in coding agent. It records each call, reports a new session id the
 * way Claude Code does (`<name>.session-id`), and answers with the task.
 */
function codingAgent(name: string, options: { wait?: Promise<void> } = {}) {
  const calls: Array<any> = []
  const log: Array<string> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name,
    model: `${name}-model`,
    '~types': TYPES,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (chatOptions: any) => {
      calls.push(chatOptions)
      const index = calls.length
      return (async function* (): AsyncGenerator<StreamChunk> {
        log.push(`${name} start ${index}`)
        yield {
          type: EventType.RUN_STARTED,
          runId: 'c',
          threadId: 't',
          timestamp: now(),
        }
        yield {
          type: EventType.CUSTOM,
          name: `${name}.session-id`,
          value: { sessionId: `${name}-session-${index}` },
          timestamp: now(),
        }
        if (options.wait) await options.wait
        const task = String(chatOptions.messages.at(-1)?.content ?? '')
        yield* textChunks(`${name} did: ${task}`)
        log.push(`${name} end ${index}`)
      })()
    },
  }
  return { adapter, calls, log }
}

async function open(input: {
  leadSteps: Array<Array<[string, string]>>
  agents: Record<
    string,
    { adapter: AnyTextAdapter; planModelOptions?: Record<string, unknown> }
  >
  workspace?: 'shared' | 'per-agent'
  persistence?: ReturnType<typeof memoryPersistence>
}) {
  const provider = makeFakeProvider()
  const persistence = input.persistence ?? memoryPersistence()
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({
    name: 'test/coding-lead',
    adapter: lead(input.leadSteps),
    subagents: { agents: [], limits: { maxConcurrent: 4 } },
    plugins: () => [
      permissions(),
      codingAgents({
        sandbox: defineSandbox({
          id: 'code',
          provider,
          workspace: defineWorkspace({
            source: { type: 'local', path: project },
          }),
        }),
        agents: Object.fromEntries(
          Object.entries(input.agents).map(([name, agent]) => [
            name,
            { description: `The ${name} agent`, ...agent },
          ]),
        ),
        ...(input.workspace ? { workspace: input.workspace } : {}),
      }),
    ],
  })
  const session = await host.open(harness, { threadId: 't' })
  return { host, session, provider, persistence, harness }
}

describe('codingAgents', () => {
  it('runs a delegate in the sandbox and resumes its session on the next call', async () => {
    const claude = codingAgent('claude-code')
    const { host, session, provider } = await open({
      leadSteps: [
        [['claude_code', 'add a test']],
        [],
        [['claude_code', 'fix the test']],
      ],
      agents: { claude_code: { adapter: claude.adapter } },
    })
    await session.prompt('first')
    await session.prompt('second')

    expect(claude.calls).toHaveLength(2)
    expect(claude.calls[0].messages).toEqual([
      { role: 'user', content: 'add a test' },
    ])
    expect(claude.calls[0].modelOptions?.sessionId).toBeUndefined()
    // The second call resumes the session the first call reported.
    expect(claude.calls[1].modelOptions).toEqual({
      sessionId: 'claude-code-session-1',
    })
    expect(claude.calls[0].threadId).toBe('t')
    // One sandbox for the thread, created once.
    expect(provider.calls.create).toBe(1)
    await host.close()
  })

  it('lists the delegates as session agents and forgets sessions with /fresh', async () => {
    const claude = codingAgent('claude-code')
    const codex = codingAgent('codex')
    const { host, session } = await open({
      leadSteps: [
        [['claude_code', 'one']],
        [],
        [['codex', 'two']],
        [],
        [['claude_code', 'three']],
      ],
      agents: {
        claude_code: { adapter: claude.adapter },
        codex: { adapter: codex.adapter },
      },
    })
    expect(session.registry.list().map((agent) => agent.name)).toEqual([
      'claude_code',
      'codex',
    ])
    await session.prompt('a')
    await session.prompt('b')
    expect(await session.command('fresh', 'nope')).toBe(
      'Unknown coding agent "nope". Agents: claude_code, codex.',
    )
    expect(await session.command('fresh', 'claude_code')).toBe(
      'claude_code starts a new session next time.',
    )
    await session.prompt('c')
    expect(claude.calls[1].modelOptions?.sessionId).toBeUndefined()
    expect(await session.command('fresh')).toBe(
      'Every coding agent starts a new session next time.',
    )
    await host.close()
  })

  it('keeps sessions across a host restart', async () => {
    const persistence = memoryPersistence()
    const first = codingAgent('claude-code')
    const before = await open({
      leadSteps: [[['claude_code', 'start']]],
      agents: { claude_code: { adapter: first.adapter } },
      persistence,
    })
    await before.session.prompt('go')
    await before.host.close()

    const second = codingAgent('claude-code')
    const after = await open({
      leadSteps: [[['claude_code', 'continue']]],
      agents: { claude_code: { adapter: second.adapter } },
      persistence,
    })
    await after.session.prompt('go on')
    expect(second.calls[0].modelOptions).toEqual({
      sessionId: 'claude-code-session-1',
    })
    await after.host.close()
  })

  it('runs shared-workspace delegates one at a time, and per-agent ones side by side', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const claude = codingAgent('claude-code', { wait: gate })
    const codex = codingAgent('codex')
    const shared = await open({
      leadSteps: [],
      agents: {
        claude_code: { adapter: claude.adapter },
        codex: { adapter: codex.adapter },
      },
    })
    // Two background runs at once, like two /agent commands.
    const first = shared.session.agent('claude_code')?.start({ task: 'edit a' })
    const second = shared.session.agent('codex')?.start({ task: 'edit b' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    // Codex waits for the lock while Claude Code holds the shared workspace.
    expect(claude.calls).toHaveLength(1)
    expect(codex.calls).toHaveLength(0)
    release()
    await first
    await second
    expect(codex.calls).toHaveLength(1)
    expect(codex.calls[0].threadId).toBe('t')
    expect(shared.provider.calls.create).toBe(1)
    await shared.host.close()

    let releaseSlow = () => {}
    const slowGate = new Promise<void>((resolve) => (releaseSlow = resolve))
    const slow = codingAgent('claude-code', { wait: slowGate })
    const fast = codingAgent('codex')
    const apart = await open({
      leadSteps: [],
      agents: {
        claude_code: { adapter: slow.adapter },
        codex: { adapter: fast.adapter },
      },
      workspace: 'per-agent',
    })
    const slowRun = apart.session
      .agent('claude_code')
      ?.start({ task: 'edit a' })
    const fastRun = apart.session.agent('codex')?.start({ task: 'edit b' })
    await fastRun
    // Codex finished while Claude Code still works in its own sandbox.
    expect(fast.calls[0].threadId).toBe('t:codex')
    expect(slow.log).toEqual(['claude-code start 1'])
    releaseSlow()
    await slowRun
    expect(slow.calls[0].threadId).toBe('t:claude_code')
    expect(apart.provider.calls.create).toBe(2)
    await apart.host.close()
  })

  it('starts delegates read-only in plan mode', async () => {
    const claude = codingAgent('claude-code')
    const codex = codingAgent('codex')
    const other = codingAgent('grok-build')
    const custom = codingAgent('acp')
    const { host, session } = await open({
      leadSteps: [
        [
          ['claude_code', 'look'],
          ['codex', 'look'],
          ['grok', 'look'],
          ['custom', 'look'],
        ],
      ],
      agents: {
        claude_code: { adapter: claude.adapter },
        codex: { adapter: codex.adapter },
        grok: { adapter: other.adapter },
        custom: {
          adapter: custom.adapter,
          planModelOptions: { readOnly: true },
        },
      },
    })
    await session.setConfig('mode', 'plan')
    await session.prompt('plan it')
    expect(claude.calls[0].modelOptions).toMatchObject({
      permissionMode: 'plan',
    })
    expect(codex.calls[0].modelOptions).toMatchObject({
      sandboxMode: 'read-only',
    })
    expect(other.calls[0].modelOptions).toBeUndefined()
    expect(custom.calls[0].modelOptions).toMatchObject({ readOnly: true })
    await host.close()
  })
})
