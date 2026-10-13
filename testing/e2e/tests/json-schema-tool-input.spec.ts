import { test, expect } from './fixtures'

test('a JSON Schema tool with invalid input returns a tool error and does not run', async ({
  request,
}) => {
  const response = await request.post('/api/json-schema-tool-input')

  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.runs).toEqual([])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('#/count')
})
