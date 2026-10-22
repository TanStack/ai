import { expect, test } from './fixtures'

/**
 * Drives `/api/compaction-usage-wire`, which runs `chat()` with a capturing
 * `fetch` and returns the request bodies, the `onCompact` reasons, and the
 * log records that compaction wrote.
 */
interface WireResult {
  ok: boolean
  error?: string
  bodies: Array<unknown>
  reasons: Array<string>
  errors: Array<string | undefined>
  records: Array<{ type: string; reason?: string }>
  folded?: unknown
}

async function runCase(
  request: { post: (url: string) => Promise<{ json: () => Promise<unknown> }> },
  name: string,
): Promise<WireResult> {
  const response = await request.post(`/api/compaction-usage-wire?case=${name}`)
  const result = (await response.json()) as WireResult
  if (!result.ok) throw new Error(`Route failed: ${result.error}`)
  return result
}

test.describe('withCompaction: usage, compactNext, overflow, durable, background', () => {
  test('countTokens usage compacts when the reported usage passes maxTokens', async ({
    request,
  }) => {
    const result = await runCase(request, 'usage')

    // The first request is small by the estimate, so it is not compacted.
    expect(JSON.stringify(result.bodies[0])).toContain('SECRET_ALPHA_ONE')
    // The first call reported 500 input tokens, so the next one compacts.
    const second = JSON.stringify(result.bodies[1])
    expect(second).not.toContain('SECRET_ALPHA_ONE')
    expect(second).toContain('omitted to save context')
    expect(second).toContain('KEEP_ME_LAST')
    expect(result.reasons).toEqual(['threshold'])
  })

  test('compactNext compacts the next call under maxTokens with auto off', async ({
    request,
  }) => {
    const result = await runCase(request, 'compact-next')

    const first = JSON.stringify(result.bodies[0])
    expect(first).not.toContain('SECRET_ALPHA_ONE')
    expect(first).toContain('omitted to save context')
    expect(result.reasons).toEqual(['forced'])
  })

  test('an overflow compacts and calls the model again in the same run', async ({
    request,
  }) => {
    const result = await runCase(request, 'overflow')

    expect(result.bodies).toHaveLength(2)
    expect(JSON.stringify(result.bodies[0])).toContain('SECRET_ALPHA_ONE')
    const retry = JSON.stringify(result.bodies[1])
    expect(retry).not.toContain('SECRET_ALPHA_ONE')
    expect(retry).toContain('KEEP_ME_LAST')
    expect(result.reasons).toEqual(['forced'])
    // The failed call never reaches the caller.
    expect(result.errors).toEqual([])
  })

  test('durable writes a compaction record that folds to the sent list', async ({
    request,
  }) => {
    const result = await runCase(request, 'durable')

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      type: 'tanstack.compaction',
      reason: 'threshold',
    })
    const folded = JSON.stringify(result.folded)
    expect(folded).toContain('KEEP_ME_LAST')
    expect(folded).not.toContain('SECRET_ALPHA_ONE')
    expect(JSON.stringify(result.bodies[0])).not.toContain('SECRET_ALPHA_ONE')
  })

  test('background prepares the summary in one run and applies it in the next', async ({
    request,
  }) => {
    const result = await runCase(request, 'background')

    // The first run does not wait for the summary.
    expect(JSON.stringify(result.bodies[0])).toContain('OLD_DETAIL')
    // The second run starts from the ready summary.
    const second = JSON.stringify(result.bodies[1])
    expect(second).toContain('EARLIER_SUMMARY')
    expect(second).not.toContain('OLD_DETAIL')
    expect(result.reasons).toEqual(['background'])
  })
})
