import { test, expect } from './fixtures'
import { SUBAGENT_PROMPTS } from '../src/lib/subagents-test'

/**
 * A router-owned turn skips the chat engine, so the usage of its children has
 * to reach the `RunRecord` of the parent run through the router itself.
 */
test.describe('subagents router run usage', () => {
  for (const scenario of ['routed-usage', 'routed-usage-handoff'] as const) {
    test(`the run record holds the terminal usage (${scenario})`, async ({
      request,
      testId,
      aimockPort,
    }) => {
      const runId = `run-${scenario}-${testId}`
      const response = await request.post('/api/subagents-test', {
        data: {
          threadId: `thread-${scenario}-${testId}`,
          runId,
          state: {},
          messages: [
            { id: 'u1', role: 'user', content: SUBAGENT_PROMPTS[scenario] },
          ],
          tools: [],
          context: [],
          forwardedProps: { scenario, testId, aimockPort },
        },
      })
      expect(response.ok()).toBe(true)

      let terminalTotal = 0
      for (const line of (await response.text()).split('\n')) {
        if (!line.startsWith('data: {')) continue
        const chunk = JSON.parse(line.slice('data: '.length)) as {
          type: string
          runId?: string
          usage?: Array<{ totalTokens?: number }>
        }
        if (chunk.type !== 'RUN_FINISHED' || chunk.runId !== runId) continue
        for (const entry of chunk.usage ?? []) {
          terminalTotal += entry.totalTokens ?? 0
        }
      }
      expect(terminalTotal).toBeGreaterThan(0)

      const record = await request.get(
        `/api/subagents-test?testId=${encodeURIComponent(testId)}&runId=${encodeURIComponent(runId)}`,
      )
      expect(await record.json()).toMatchObject({
        status: 'completed',
        usage: { totalTokens: terminalTotal },
      })
    })
  }
})
