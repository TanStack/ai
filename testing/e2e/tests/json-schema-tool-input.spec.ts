import { test, expect } from './fixtures'

test('a JSON Schema tool repairs "3" to 3, returns a tool error for input it cannot repair, and a nullable field takes null', async ({
  request,
}) => {
  const response = await request.post('/api/json-schema-tool-input')

  expect(response.ok()).toBe(true)
  const body = await response.json()
  // The repaired call and the OpenAPI 3.0 nullable tool ran.
  expect(body.runs).toEqual([{ count: 3 }, { label: null }])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('#/count')
  expect(body.text).toContain('Tool said: counted')
  expect(body.text).toContain('Tool said: labeled')
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
  expect(body.runs).toEqual([{ count: 2 }, { label: null }])
  expect(body.text).toContain('Input validation failed for tool count_items')
  expect(body.text).toContain('Tool said: counted')
})
