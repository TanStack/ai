import { expect, test } from '@playwright/test'

/**
 * Provider-free Workflow integration harness. The route uses a fixed agent
 * stream, so no model HTTP request reaches aimock.
 */
test('Workflow-backed orchestration projects one outer AG-UI run', async ({
  request,
}) => {
  const response = await request.post('/api/workflow-orchestration')
  expect(response.ok()).toBeTruthy()

  const chunks = parseSse(await response.text())
  const types = chunks.map((chunk) => chunk.type)

  expect(types).toEqual([
    'RUN_STARTED',
    'STEP_STARTED',
    'TEXT_MESSAGE_START',
    'TEXT_MESSAGE_CONTENT',
    'TEXT_MESSAGE_END',
    'STEP_FINISHED',
    'RUN_FINISHED',
  ])
  expect(chunks[1]).toMatchObject({
    stepName: 'writer',
    stepId: 'draft',
    stepType: 'agent',
  })
  expect(chunks[3]).toMatchObject({ delta: 'Workflow-backed response' })
  expect(chunks.at(-1)).toMatchObject({
    result: 'Workflow-backed response',
  })
  expect(chunks.some((chunk) => chunk.runId === 'inner-model-run')).toBe(false)
})

function parseSse(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const data = block.split('\n').find((line) => line.startsWith('data:'))
      if (!data) throw new Error('SSE event missing data')
      return JSON.parse(data.slice(data.indexOf(':') + 1).trim())
    })
}
