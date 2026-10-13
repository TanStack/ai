import { test, expect } from './fixtures'

/**
 * A tool schema property named `__proto__` must reach the provider.
 * `stripUnsupportedFormats`, the last step of the strict schema conversion,
 * must copy it as an own key.
 */
test('a tool schema keeps a property named __proto__', async ({ request }) => {
  const response = await request.post('/api/own-key-schema-wire')
  expect(response.ok()).toBe(true)
  const { body } = await response.json()
  const parameters = body.tools[0].function.parameters
  expect(Object.hasOwn(parameters.properties, '__proto__')).toBe(true)
  expect(Object.keys(parameters.properties)).toEqual([
    '__proto__',
    'constructor',
  ])
  expect(parameters.required).toEqual(['__proto__', 'constructor'])
})
