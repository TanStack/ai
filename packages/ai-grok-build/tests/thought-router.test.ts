import { describe, expect, it } from 'vitest'
import { GrokThoughtRouter } from '../src/stream/thought-router'
import type { StreamChunk } from '@tanstack/ai'

async function collectRouter(
  deltas: Array<string>,
  finalize = true,
): Promise<Array<StreamChunk>> {
  const router = new GrokThoughtRouter({
    model: 'grok-build',
    genId: (() => {
      let n = 0
      return () => `id-${++n}`
    })(),
    now: () => 1,
  })
  const out: Array<StreamChunk> = []
  for (const delta of deltas) {
    for (const chunk of router.push(delta)) out.push(chunk)
  }
  if (finalize) {
    for (const chunk of router.finalize()) out.push(chunk)
  }
  return out
}

describe('GrokThoughtRouter', () => {
  it('routes planning-only thought to REASONING chunks', async () => {
    const chunks = await collectRouter([
      'The user wants a kanban board. ',
      'The workspace is empty.',
    ])
    const reasoning = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(reasoning).toContain('kanban board')
    expect(chunks.some((c) => c.type === 'TOOL_CALL_START')).toBe(false)
  })

  it('routes tool narration in thought to TOOL_CALL chunks', async () => {
    const chunks = await collectRouter([
      'Recipe is clear. ',
      'Use run_terminal_command. ',
      '`npx --yes @tanstack/cli create my-app` ',
      'Still installing. Poll again.',
    ])

    expect(chunks.some((c) => c.type === 'TOOL_CALL_START')).toBe(true)
    const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START') as {
      toolCallName?: string
    }
    expect(toolStart.toolCallName).toBe('run_terminal_command')

    const args = chunks
      .filter((c) => c.type === 'TOOL_CALL_ARGS')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(args).toContain('npx --yes @tanstack/cli create my-app')
    expect(chunks.some((c) => c.type === 'TOOL_CALL_RESULT')).toBe(true)

    const reasoning = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(reasoning).toContain('Recipe is clear')
    expect(reasoning).not.toContain('Still installing')
  })

  it('routes tanstackStartRecipe narration to a tool call', async () => {
    const chunks = await collectRouter([
      'For tanstackStartRecipe: the recipe is clear.',
    ])
    const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START') as {
      toolCallName?: string
    }
    expect(toolStart?.toolCallName).toBe('tanstackStartRecipe')
  })

  it('routes token-by-token thought streams without leaking tool narration into reasoning', async () => {
    const deltas = [
      'The',
      ' user',
      ' wants',
      ' me',
      ' to',
      ' run',
      ' `',
      'ls',
      ' -',
      'la',
      '`.',
      ' I',
      ' should',
      ' use',
      ' the',
      ' `',
      'run',
      '_terminal',
      '_command',
      '`',
      ' tool',
      ' for',
      ' this.',
      '\n',
      'The',
      ' command',
      ' ran',
      ' successfully',
      '.',
    ]
    const chunks = await collectRouter(deltas)

    expect(chunks.some((c) => c.type === 'TOOL_CALL_START')).toBe(true)
    const reasoning = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(reasoning).toContain('wants me to run')
    expect(reasoning).not.toContain('run_terminal_command')
    expect(reasoning).not.toContain('ran successfully')
  })

  it('routes shell commands in backticks even without naming the harness tool', async () => {
    const chunks = await collectRouter([
      'Plan: run `ls -la` in the workspace.',
      'The command ran successfully.',
    ])
    expect(chunks.some((c) => c.type === 'TOOL_CALL_START')).toBe(true)
    const reasoning = chunks
      .filter((c) => c.type === 'REASONING_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(reasoning).toContain('Plan:')
    expect(reasoning).not.toContain('ran successfully')
  })
})
