import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  compact,
  decidePermission,
  globToRegExp,
  modelPicker,
  permissions,
  todos,
  usage,
} from '../src/first-party'
import { fileCommands, projectInstructions } from '../src/first-party/node'
import { workspaceTools } from '../src/first-party/coding'
import {
  messageTexts,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
} from './helpers'
import type { HarnessPlugin } from '../src'
import type { AnyTextAdapter } from '@tanstack/ai'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

/** The key of the thread `t` in the stores, in the default tenant. */

let root = ''
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function open(adapter: AnyTextAdapter, plugins: Array<HarnessPlugin>) {
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/first-party',
      adapter,
      plugins: () => plugins,
    }),
    {
      threadId: 't',
    },
  )
  return { host, session, persistence }
}

describe('decidePermission', () => {
  const rules = [
    { tool: 'read_file', decision: 'allow' as const, kind: 'read' as const },
    { tool: 'write_file', decision: 'ask' as const, kind: 'edit' as const },
    { tool: 'bash', decision: 'ask' as const, kind: 'execute' as const },
  ]
  it('applies modes on top of the rules', () => {
    expect(decidePermission(rules, 'write_file', 'default')).toBe('ask')
    expect(decidePermission(rules, 'write_file', 'acceptEdits')).toBe('allow')
    expect(decidePermission(rules, 'bash', 'acceptEdits')).toBe('ask')
    expect(decidePermission(rules, 'write_file', 'plan')).toBe('deny')
    expect(decidePermission(rules, 'read_file', 'plan')).toBe('allow')
    expect(decidePermission(rules, 'bash', 'bypass')).toBe('allow')
  })
})

describe('workspace tools with permissions', () => {
  it('reads freely, asks before writing, and stays inside the root', async () => {
    await writeFile(join(root, 'notes.txt'), 'hello\nworld\n')
    const { adapter, calls } = mockAdapter([
      () => toolCall('read_file', { path: 'notes.txt' }, 'c1'),
      () =>
        toolCall('write_file', { path: 'out.txt', content: 'written' }, 'c2'),
      () => toolCall('read_file', { path: '../escape.txt' }, 'c3'),
      () => text('done'),
    ])
    const { host, session } = await open(adapter, [
      permissions(),
      workspaceTools({ root }),
    ])

    // The write asks before it runs: the turn stops with an approval wait.
    await session.send('work')
    const [wait] = session.snapshot().pendingWaits
    expect(wait?.kind).toBe('approval')
    expect(wait?.message).toContain('write_file')
    await session.resolve({
      resume: [
        {
          interruptId: wait!.waitId,
          status: 'resolved',
          payload: { answer: 'once' },
        },
      ],
      inputId: 'approve',
    })
    await session.settled({ inputId: 'approve' })

    expect(await readFile(join(root, 'out.txt'), 'utf8')).toBe('written')
    const toolResults = JSON.stringify(calls[3].messages)
    expect(toolResults).toContain('1\\thello')
    expect(toolResults).toContain('outside the workspace')
    await host.close()
  })

  it('denies edits in plan mode without asking', async () => {
    const { adapter } = mockAdapter([
      () => toolCall('write_file', { path: 'x.txt', content: 'x' }, 'c1'),
      () => text('ok'),
    ])
    const { host, session } = await open(adapter, [
      permissions(),
      workspaceTools({ root }),
    ])
    expect(await session.runCommand({ name: 'mode', input: 'plan' })).toBe(
      'Mode: plan.',
    )
    await session.send('write')
    await expect(readFile(join(root, 'x.txt'), 'utf8')).rejects.toThrow()
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('matches globs like the list tool', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b.ts')).toBe(true)
    expect(globToRegExp('src/**/*.ts').test('src/b.ts')).toBe(true)
    expect(globToRegExp('*.md').test('docs/a.md')).toBe(false)
  })

  it('matches whole folders with **/, and one of the parts with {a,b}', () => {
    expect(globToRegExp('src/**/test.ts').test('src/test.ts')).toBe(true)
    expect(globToRegExp('src/**/test.ts').test('src/a/test.ts')).toBe(true)
    expect(globToRegExp('src/**/test.ts').test('src/mytest.ts')).toBe(false)
    expect(globToRegExp('**/.env').test('a/.env')).toBe(true)
    expect(globToRegExp('**/.env').test('prod.env')).toBe(false)
    const keys = globToRegExp('secrets/**/*.{pem,key}')
    expect(keys.test('secrets/a/b.key')).toBe(true)
    expect(keys.test('secrets/b.pem')).toBe(true)
    expect(keys.test('secrets/b.txt')).toBe(false)
  })
})

describe('modelPicker', () => {
  it('switches the main model with /model', async () => {
    const fast = mockAdapter([() => text('fast answer')])
    const smart = mockAdapter([() => text('smart answer')])
    const { host, session } = await open(smart.adapter, [
      modelPicker({
        choices: { smart: smart.adapter, fast: fast.adapter },
        default: 'smart',
      }),
    ])
    expect(
      await session.runCommand({ name: 'model', input: 'fast' }),
    ).toContain('Model: fast')
    expect(await session.send('hi')).toEqual({
      text: 'fast answer',
      media: [],
    })
    expect(
      await session.runCommand({ name: 'model', input: 'nope' }),
    ).toContain('Unknown model')
    await host.close()
  })
})

describe('todos', () => {
  it('keeps the list in state and shows it in the next prompt', async () => {
    const { adapter, calls } = mockAdapter([
      () =>
        toolCall('todo_write', {
          todos: [{ text: 'write tests', status: 'in_progress' }],
        }),
      () => text('planned'),
      () => text('next'),
    ])
    const { host, session, persistence } = await open(adapter, [todos()])
    await session.send('plan it')
    expect(await session.runCommand({ name: 'todos' })).toBe('[~] write tests')
    await session.send('continue')
    // A `'context'` prompt: the last system prompt, not a message.
    expect(JSON.stringify(calls[2].systemPrompts.at(-1))).toContain(
      '[~] write tests',
    )
    expect(messageTexts(calls[2]).at(-1)).toBe('continue')
    const stored = await storedThreadState(persistence.stores.log, {
      threadId: 't',
    })
    expect(stored.plugins.get('tanstack/todos')).toEqual({
      items: [{ text: 'write tests', status: 'in_progress' }],
    })
    await host.close()
  })
})

describe('project files', () => {
  it('adds AGENTS.md to the prompt and turns command files into commands', async () => {
    await writeFile(join(root, 'AGENTS.md'), 'Use tabs.')
    await mkdir(join(root, 'commands'))
    await writeFile(
      join(root, 'commands', 'review.md'),
      '---\ndescription: Review a file\n---\nReview $ARGUMENTS carefully.',
    )
    const { adapter, calls } = mockAdapter([() => text('reviewed')])
    const { host, session } = await open(adapter, [
      projectInstructions({ root }),
      fileCommands({ dir: join(root, 'commands') }),
    ])
    expect(session.commands()).toEqual([
      {
        name: 'review',
        description: 'Review a file',
        owner: 'tanstack/file-commands',
      },
    ])
    await session.runCommand({ name: 'review', input: 'src/app.ts' })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0])).toEqual(['Review src/app.ts carefully.'])
    expect(JSON.stringify(calls[0].systemPrompts)).toContain('Use tabs.')
    await waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await host.close()
  })
})

describe('compact and usage', () => {
  it('replaces the transcript with a summary and counts tokens', async () => {
    const summarizer = mockAdapter([() => text('We planned a trip.')])
    // Real adapters report usage on RUN_FINISHED.
    const withUsage = (answer: string) => () =>
      text(answer).map((chunk) =>
        chunk.type === 'RUN_FINISHED'
          ? {
              ...chunk,
              usage: [
                {
                  inputTokens: 10,
                  outputTokens: 5,
                  totalTokens: 15,
                  cachedInputTokens: 6,
                  cacheWriteInputTokens: 2,
                },
              ],
            }
          : chunk,
      )
    const main = mockAdapter([withUsage('one'), withUsage('two')])
    const { host, session } = await open(main.adapter, [
      compact({ adapter: summarizer.adapter }),
      usage(),
    ])
    await session.send('first')
    await session.send('second')
    expect(await session.runCommand({ name: 'compact' })).toBe(
      'Compacted 4 messages into a summary.',
    )
    const transcript = await session.transcript()
    expect(transcript).toHaveLength(2)
    expect(transcript[0]?.content).toContain('We planned a trip.')
    expect(await session.runCommand({ name: 'usage' })).toBe(
      '2 model calls, 20 input tokens (12 cache read, 4 cache write), 10 output tokens, 30 total.',
    )
    await host.close()
  })

  it('counts the summary call of /compact under plugin:tanstack/compact', async () => {
    const summarizer = mockAdapter([
      () =>
        text('We planned a trip.').map((chunk) =>
          chunk.type === 'RUN_FINISHED'
            ? {
                ...chunk,
                usage: {
                  promptTokens: 40,
                  completionTokens: 8,
                  totalTokens: 48,
                },
              }
            : chunk,
        ),
    ])
    const main = mockAdapter([() => text('one'), () => text('two')])
    const { host, session } = await open(main.adapter, [
      compact({ adapter: summarizer.adapter }),
    ])
    await session.send('first')
    await session.send('second')

    await session.runCommand({ name: 'compact' })

    expect(session.usage().bySource).toEqual({
      'plugin:tanstack/compact': expect.objectContaining({
        calls: 1,
        totalTokens: 48,
      }),
    })
    await host.close()
  })
})
