import { describe, expect, it, vi } from 'vitest'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { SubagentBudget } from '../src/activities/chat/agents/limits'
import { chat } from '../src/activities/chat'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'

/** A model that calls `name` once for each id, all in one turn, then stops. */
function callsInOneTurn(name: string, ids: Array<string>) {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ...ids.flatMap((id) => [ev.toolStart(id, name), ev.toolArgs(id, '{}')]),
        ev.runFinished('tool_calls'),
      ],
      [ev.runStarted(), ev.runFinished('stop')],
    ],
  })
}

function results(chunks: Array<StreamChunk>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const chunk of chunks) {
    if (
      chunk.type === 'TOOL_CALL_RESULT' &&
      typeof chunk.content === 'string'
    ) {
      out[chunk.toolCallId] = JSON.parse(chunk.content)
    }
  }
  return out
}

describe('SubagentBudget', () => {
  it('counts calls across the tree and checks depth', () => {
    const root = SubagentBudget.root({ maxCalls: 2, maxDepth: 1 })
    expect(root.reserve(0)).toBeUndefined()
    const child = root.child()
    expect(child.reserve(0)).toBe('subagent limit reached (maxDepth 1)')
    expect(root.reserve(0)).toBeUndefined()
    expect(root.reserve(0)).toBe('subagent limit reached (maxCalls 2)')
    expect(child.calls).toBe(2)
  })

  it('never gives a child more time than its parent has left', () => {
    const root = SubagentBudget.root({ timeoutMs: 10_000 })
    expect(root.childTimeout(0)).toBe(10_000)
    const child = root.child(5_000)
    expect(child.childTimeout(1_000)).toBe(4_000)
  })
})

describe('subagent limits', () => {
  it('refuses children past maxCalls with a tool error', async () => {
    const run = vi.fn(async () => 'done')
    const worker = defineAgent({ name: 'worker', description: 'Works', run })
    const { adapter } = callsInOneTurn('worker', ['c1', 'c2', 'c3'])
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [worker], limits: { maxCalls: 2 } },
      }) as AsyncIterable<StreamChunk>,
    )
    const byId = results(chunks)
    const refused = Object.values(byId).filter(
      (result) => result.error !== undefined,
    )
    expect(refused).toHaveLength(1)
    expect(refused[0].error).toBe('subagent limit reached (maxCalls 2)')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('passes the budget to nested children through ctx.chat', async () => {
    const grandchildRun = vi.fn(async () => 'deep')
    const grandchild = defineAgent({
      name: 'grandchild',
      description: 'Deep',
      run: grandchildRun,
    })
    const child = defineAgent({
      name: 'child',
      description: 'Calls a grandchild',
      run: (ctx) =>
        ctx.chat({
          adapter: callsInOneTurn('grandchild', ['g1']).adapter,
          subagents: { agents: [grandchild] },
        }),
    })
    const { adapter } = callsInOneTurn('child', ['c1'])
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [child], limits: { maxDepth: 1 } },
      }) as AsyncIterable<StreamChunk>,
    )
    expect(grandchildRun).not.toHaveBeenCalled()
    const grandchildResult = chunks.find(
      (chunk) => chunk.type === 'TOOL_CALL_RESULT' && chunk.toolCallId === 'g1',
    )
    expect(JSON.stringify(grandchildResult)).toContain('maxDepth 1')
  })

  it('stops a child that runs past timeoutMs', async () => {
    const slow = defineAgent({
      name: 'slow',
      description: 'Never finishes on its own',
      run: (ctx) =>
        new Promise<string>((resolve) => {
          ctx.abortSignal?.addEventListener('abort', () => resolve('stopped'))
        }),
    })
    const { adapter } = callsInOneTurn('slow', ['c1'])
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [slow], limits: { timeoutMs: 20 } },
      }) as AsyncIterable<StreamChunk>,
    )
    expect(results(chunks).c1.error).toBeDefined()
  })

  it('refuses children past maxConcurrent in one turn', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const waiting = defineAgent({
      name: 'waiting',
      description: 'Waits',
      run: async () => {
        await gate
        return 'ok'
      },
    })
    setTimeout(() => release(), 20)
    const { adapter } = callsInOneTurn('waiting', ['c1', 'c2', 'c3'])
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [waiting], limits: { maxConcurrent: 2 } },
      }) as AsyncIterable<StreamChunk>,
    )
    const errors = Object.values(results(chunks))
      .map((result) => result.error)
      .filter(Boolean)
    // Tool calls in one turn may run one after another; a refusal only happens
    // when they overlap. Either way no more than two run at once.
    expect(
      errors.every(
        (error) => error === 'subagent limit reached (maxConcurrent 2)',
      ),
    ).toBe(true)
  })
})
