import { describe, expect, it } from 'vitest'
import { chat, defineAgent } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { memoryPersistence, withPersistence } from '../src'

describe('usage of a router-owned run', () => {
  it.each(['exclusive', 'handoff'] as const)(
    'saves the terminal total on the run record (%s)',
    async (strategy) => {
      const persistence = memoryPersistence()
      const childAdapter = fakeText()
      childAdapter.setResponses([{ text: 'child answer' }])
      const parentAdapter = fakeText()
      parentAdapter.setResponses([{ text: 'parent answer' }])
      const child = defineAgent({
        name: 'child',
        description: 'Answers once.',
        run: async (ctx) =>
          chat({
            adapter: childAdapter,
            messages: [{ role: 'user', content: 'hello' }],
            ...ctx.forward,
          }),
      })

      let terminalTotal = 0
      for await (const chunk of chat({
        adapter: parentAdapter,
        messages: [{ role: 'user', content: 'run something' }],
        threadId: 't1',
        runId: 'r1',
        middleware: [withPersistence(persistence)],
        subagents: { agents: [child], strategy, router: () => 'child' },
      })) {
        if (chunk.type === 'RUN_FINISHED' && Array.isArray(chunk.usage)) {
          for (const entry of chunk.usage) {
            terminalTotal += entry.totalTokens ?? 0
          }
        }
      }

      const run = await persistence.stores.runs.get('r1')
      expect(terminalTotal).toBeGreaterThan(0)
      expect(run?.status).toBe('completed')
      expect(run?.usage?.totalTokens).toBe(terminalTotal)
    },
  )
})
