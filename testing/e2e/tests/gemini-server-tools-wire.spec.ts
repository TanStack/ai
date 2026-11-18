import { test, expect } from './fixtures'

/**
 * Google Search beside a function tool on Gemini 3. The
 * `/gemini-server-tools` mount fails like the Gemini API when the request has
 * no `includeServerSideToolInvocations`, or when the next step does not send
 * the signed `toolCall` / `toolResponse` parts back around the function call.
 */
test('gemini runs Google Search and a function tool in one agent loop', async ({
  request,
}) => {
  const res = await request.post('/api/gemini-server-tools-wire')
  expect(res.ok()).toBe(true)
  const result = (await res.json()) as {
    ok: boolean
    error?: string
    text: string
    tools: Array<string>
  }
  expect(result.error).toBeUndefined()
  expect(result).toMatchObject({
    ok: true,
    text: 'Caucus night is Tuesday at the library.',
  })
  expect(result.tools).toEqual(
    expect.arrayContaining(['lookup_caucus', 'google_search']),
  )
})
