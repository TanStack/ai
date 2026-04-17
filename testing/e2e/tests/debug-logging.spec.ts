import { test, expect } from './fixtures'

type LogEntry = { level: 'debug' | 'info' | 'warn' | 'error'; message: string }

async function runDebugRun(
  request: import('@playwright/test').APIRequestContext,
  payload: Record<string, unknown>,
): Promise<Array<LogEntry>> {
  const res = await request.post('/api/debug-logging', { data: payload })
  expect(res.ok(), `expected 200 from /api/debug-logging, got ${res.status()}`)
    .toBe(true)
  const body = (await res.json()) as {
    logs: Array<LogEntry>
    error?: string
  }
  expect(body.error, 'unexpected server error').toBeUndefined()
  return body.logs
}

function hasPrefix(logs: Array<LogEntry>, prefix: string): boolean {
  return logs.some((l) => l.message.startsWith(prefix))
}

test.describe('debug logging', () => {
  test('debug: true emits request, provider, and output prefixes', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const logs = await runDebugRun(request, {
      testId,
      aimockPort,
      debug: true,
      userMessage: '[debug-logging] hello',
    })

    expect(
      hasPrefix(logs, '[tanstack-ai:request]'),
      `missing [tanstack-ai:request]; got: ${logs.map((l) => l.message).join(' | ')}`,
    ).toBe(true)
    expect(
      hasPrefix(logs, '[tanstack-ai:provider]'),
      `missing [tanstack-ai:provider]; got: ${logs.map((l) => l.message).join(' | ')}`,
    ).toBe(true)
    expect(
      hasPrefix(logs, '[tanstack-ai:output]'),
      `missing [tanstack-ai:output]; got: ${logs.map((l) => l.message).join(' | ')}`,
    ).toBe(true)
  })

  test('debug: { middleware: false } silences middleware prefix only', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const logs = await runDebugRun(request, {
      testId,
      aimockPort,
      debug: { middleware: false },
      userMessage: '[debug-logging] hello',
    })

    // Middleware category is off but others (including request/output) remain on.
    expect(hasPrefix(logs, '[tanstack-ai:middleware]')).toBe(false)
    expect(hasPrefix(logs, '[tanstack-ai:request]')).toBe(true)
    expect(hasPrefix(logs, '[tanstack-ai:output]')).toBe(true)
  })

  test('debug: false suppresses all [tanstack-ai:*] lines', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const logs = await runDebugRun(request, {
      testId,
      aimockPort,
      debug: false,
      userMessage: '[debug-logging] hello',
    })

    const tanstackLines = logs.filter((l) =>
      l.message.startsWith('[tanstack-ai:'),
    )
    expect(
      tanstackLines,
      `expected no [tanstack-ai:*] lines, got: ${tanstackLines
        .map((l) => l.message)
        .join(' | ')}`,
    ).toHaveLength(0)
  })
})
