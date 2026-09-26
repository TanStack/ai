import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  compact,
  decidePermission,
  fileCommands,
  globToRegExp,
  modelPicker,
  permissions,
  projectInstructions,
  todos,
  usage,
  workspaceTools,
} from '../src/first-party'
import { messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { HarnessPlugin } from '../src'
import type { AnyTextAdapter } from '@tanstack/ai'

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

    const turn = session.prompt('work')
    await vi.waitFor(() =>
      expect(session.snapshot().pendingQuestions).toHaveLength(1),
    )
    const [question] = session.snapshot().pendingQuestions
    expect(question?.message).toContain('write_file')
    await session.answer(question!.questionId, 'y')
    await turn

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
    expect(await session.command('mode', 'plan')).toBe('Mode: plan.')
    await session.prompt('write')
    await expect(readFile(join(root, 'x.txt'), 'utf8')).rejects.toThrow()
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    await host.close()
  })

  it('matches globs like the list tool', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b.ts')).toBe(true)
    expect(globToRegExp('src/**/*.ts').test('src/b.ts')).toBe(true)
    expect(globToRegExp('*.md').test('docs/a.md')).toBe(false)
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
    expect(await session.command('model', 'fast')).toContain('Model: fast')
    expect(await session.prompt('hi')).toEqual({ text: 'fast answer' })
    expect(await session.command('model', 'nope')).toContain('Unknown model')
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
    await session.prompt('plan it')
    expect(await session.command('todos')).toBe('[~] write tests')
    await session.prompt('continue')
    expect(JSON.stringify(calls[2].systemPrompts)).toContain('[~] write tests')
    expect(
      await persistence.stores.metadata.get('plugin:tanstack/todos', 't'),
    ).toEqual({
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
    await session.command('review', 'src/app.ts')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0])).toEqual(['Review src/app.ts carefully.'])
    expect(JSON.stringify(calls[0].systemPrompts)).toContain('Use tabs.')
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
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
              usage: [{ inputTokens: 10, outputTokens: 5, totalTokens: 15 }],
            }
          : chunk,
      )
    const main = mockAdapter([withUsage('one'), withUsage('two')])
    const { host, session, persistence } = await open(main.adapter, [
      compact({ adapter: summarizer.adapter }),
      usage(),
    ])
    await session.prompt('first')
    await session.prompt('second')
    expect(await session.command('compact')).toBe(
      'Compacted 4 messages into a summary.',
    )
    const transcript = await persistence.stores.messages.loadThread('t')
    expect(transcript).toHaveLength(2)
    expect(transcript[0]?.content).toContain('We planned a trip.')
    expect(await session.command('usage')).toBe(
      '2 model calls, 20 input tokens, 10 output tokens, 30 total.',
    )
    await host.close()
  })
})
