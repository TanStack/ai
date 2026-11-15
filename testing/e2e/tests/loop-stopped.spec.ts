import { test, expect } from './fixtures'

type Finished = { finishReason?: string; loopStopped?: boolean }

/** The `metadata.tanstack` of each RUN_FINISHED in an SSE body. */
function runFinished(body: string): Array<Finished> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
    .filter((event) => event.type === 'RUN_FINISHED')
    .map((event) => {
      const { finishReason, loopStopped } = event.metadata?.tanstack ?? {}
      return { finishReason, loopStopped }
    })
}

// The route is described at `src/routes/api.loop-stopped.ts`.
test.describe('agent loop stopped by maxIterations', () => {
  test('the last RUN_FINISHED on the wire has loopStopped', async ({
    request,
  }) => {
    const res = await request.post('/api/loop-stopped')
    expect(res.ok()).toBe(true)

    expect(runFinished(await res.text())).toEqual([
      { finishReason: 'tool_calls' },
      { finishReason: 'tool_calls' },
      { finishReason: 'tool_calls', loopStopped: true },
    ])
  })

  test('a run that the model ends has no loopStopped', async ({ request }) => {
    const res = await request.post('/api/loop-stopped?done')
    expect(res.ok()).toBe(true)

    expect(runFinished(await res.text())).toEqual([
      { finishReason: 'tool_calls' },
      { finishReason: 'stop' },
    ])
  })
})
