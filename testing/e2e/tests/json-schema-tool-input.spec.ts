import { test, expect } from './fixtures'

test('a JSON Schema tool repairs "3" to 3, and returns a tool error for input it cannot repair', async ({
  request,
}) => {
  const response = await request.post('/api/json-schema-tool-input')

  expect(response.ok()).toBe(true)
  const body = await response.json()
  // Only the repaired call ran.
  expect(body.runs).toEqual([{ count: 3 }])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('#/count')
  expect(body.text).toContain('counted')
})

test('a repairToolInput function replaces the built-in repair', async ({
  request,
}) => {
  const response = await request.post('/api/json-schema-tool-input', {
    data: { repair: 'custom' },
  })

  expect(response.ok()).toBe(true)
  const body = await response.json()
  // The function repaired 'many'. The built-in repair did not fix '3'.
  expect(body.runs).toEqual([{ count: 2 }])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('counted')
})
