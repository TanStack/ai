import { test, expect } from './fixtures'

/**
 * Wire-format verification for the PORTABLE skills path (`withSkills`).
 *
 * Drives `/api/portable-skills-wire`, which intercepts the outgoing SDK request
 * via a custom `fetch` and returns the captured headers + body as JSON. We
 * assert the rendered catalog reaches the model and the activation tools are
 * advertised — without a real API key.
 */

type Captured = {
  ok: boolean
  error?: string
  capturedRequest: { headers: Record<string, string>; body: any } | null
}

async function post(request: any, query: string): Promise<Captured> {
  const res = await request.post(`/api/portable-skills-wire${query}`)
  expect(res.ok()).toBe(true)
  return (await res.json()) as Captured
}

test.describe('portable skills — withSkills wire format', () => {
  test('anthropic: catalog renders as <available_skills> XML in system', async ({
    request,
  }) => {
    const { ok, error, capturedRequest } = await post(
      request,
      '?provider=anthropic',
    )
    if (!ok) throw new Error(`Route failed: ${error}`)
    const body = capturedRequest?.body
    const system = JSON.stringify(body?.system)
    expect(system).toContain('<available_skills>')
    expect(system).toContain('pptx-helper')

    const toolNames = (body?.tools ?? []).map((t: any) => t.name)
    expect(toolNames).toContain('load_skill')
    expect(toolNames).toContain('read_skill_resource')
  })

  test('openai: catalog renders as a markdown section in instructions', async ({
    request,
  }) => {
    const { ok, error, capturedRequest } = await post(
      request,
      '?provider=openai',
    )
    if (!ok) throw new Error(`Route failed: ${error}`)
    const body = capturedRequest?.body
    const instructions = JSON.stringify(body?.instructions)
    expect(instructions).toContain('Available skills')
    expect(instructions).toContain('pptx-helper')

    const toolNames = (body?.tools ?? []).map((t: any) => t.name)
    expect(toolNames).toContain('load_skill')
  })

  test('refuses to combine portable withSkills with hosted native skills', async ({
    request,
  }) => {
    const { ok, error } = await post(
      request,
      '?provider=anthropic&mode=coexist',
    )
    expect(ok).toBe(false)
    expect(error).toContain('code_execution')
    expect(error).toMatch(/portable|withSkills/i)
  })
})
