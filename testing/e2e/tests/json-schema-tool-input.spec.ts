import { test, expect } from './fixtures'

test('a JSON Schema tool with invalid input returns a tool error and does not run, and a nullable field takes null', async ({
  request,
}) => {
  const response = await request.post('/api/json-schema-tool-input')

  expect(response.ok()).toBe(true)
  const body = await response.json()
  // Only the OpenAPI 3.0 nullable tool ran.
  expect(body.runs).toEqual([{ label: null }])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('#/count')
  expect(body.text).toContain('Tool said: labeled')
})
