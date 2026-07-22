import { SpanKind } from '@opentelemetry/api'
import { test, expect } from './fixtures'

async function fetchOtelCapture(
  page: import('@playwright/test').Page,
  baseURL: string | undefined,
  testId: string | undefined,
) {
  if (!testId) throw new Error('otel capture test requires a testId fixture')
  const url = `${baseURL ?? ''}/api/middleware-test?testId=${encodeURIComponent(testId)}`
  const response = await page.request.get(url)
  if (!response.ok()) {
    throw new Error(
      `GET ${url} failed: ${response.status()} ${await response.text()}`,
    )
  }
  return response.json()
}

test.describe('Middleware Lifecycle', () => {
  test('onChunk transforms text content', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000) // hydration
    await page.locator('#mw-scenario-select').selectOption('basic-text')
    await page.locator('#mw-mode-select').selectOption('chunk-transform')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const messagesJson = await page.locator('#mw-messages-json').textContent()
    const messages = JSON.parse(messagesJson || '[]')
    const assistantMsg = messages.find((m: any) => m.role === 'assistant')
    const textPart = assistantMsg?.parts?.find((p: any) => p.type === 'text')
    expect(textPart?.content).toContain('[MW]')
  })

  test('onBeforeToolCall skips tool execution', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000)
    await page.locator('#mw-scenario-select').selectOption('with-tool')
    await page.locator('#mw-mode-select').selectOption('tool-skip')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const messagesJson = await page.locator('#mw-messages-json').textContent()
    const messages = JSON.parse(messagesJson || '[]')

    // Find tool result parts
    const toolResults = messages.flatMap((m: any) =>
      m.parts.filter((p: any) => p.type === 'tool-result'),
    )
    expect(toolResults.length).toBeGreaterThan(0)
    expect(toolResults[0].content).toContain('skipped')
  })

  test('capability provide/consume flow surfaces the consumed value in the stream', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000) // hydration
    await page.locator('#mw-scenario-select').selectOption('capability')
    await page.locator('#mw-mode-select').selectOption('capability')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const messagesJson = await page.locator('#mw-messages-json').textContent()
    const messages = JSON.parse(messagesJson || '[]')
    const assistantMsg = messages.find((m: any) => m.role === 'assistant')
    const textPart = assistantMsg?.parts?.find((p: any) => p.type === 'text')
    // The provider middleware provides "[CAP]" in setup(); the consumer
    // middleware reads it via the capability getter in onChunk and prefixes
    // each text delta. Seeing "[CAP]" in the streamed text proves the provided
    // capability value flowed across middleware to the consumer.
    expect(textPart?.content).toContain('[CAP]')
    expect(textPart?.content).toContain('Hello')
  })

  test('otel middleware emits chat span + per-iteration token histograms', async ({
    page,
    testId,
    aimockPort,
    baseURL,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000)
    await page.locator('#mw-scenario-select').selectOption('basic-text')
    await page.locator('#mw-mode-select').selectOption('otel')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const capture = await fetchOtelCapture(page, baseURL, testId)

    // Root span is kind=INTERNAL; iteration spans are kind=CLIENT. This is a
    // structural discriminator, immune to accidental attribute renames on
    // either span.
    const chatSpans = capture.spans.filter(
      (s: any) => s.kind === SpanKind.INTERNAL,
    )
    expect(chatSpans).toHaveLength(1)
    const chatSpan = chatSpans[0]
    expect(chatSpan.ended).toBe(true)
    // `gen_ai.operation.name` is intentionally NOT set on the root span —
    // only iteration spans carry it (see otel.ts).
    expect(chatSpan.attributes['gen_ai.operation.name']).toBeUndefined()

    const iterationSpans = capture.spans.filter(
      (s: any) => s.kind === SpanKind.CLIENT,
    )
    expect(iterationSpans.length).toBeGreaterThanOrEqual(1)
    for (const iter of iterationSpans) {
      expect(iter.ended).toBe(true)
      expect(iter.attributes['gen_ai.operation.name']).toBe('chat')
    }

    // Token histogram records show up with correct unit and low-cardinality attrs.
    const tokenRecords = capture.histograms.filter(
      (h: any) => h.name === 'gen_ai.client.token.usage',
    )
    // Guard against the C1 regression: onUsage used to no-op in production order,
    // losing every token histogram record. If we ever regress, this assertion fails.
    expect(tokenRecords.length).toBeGreaterThanOrEqual(2)
    for (const r of tokenRecords) {
      expect(r.unit).toBe('{token}')
      expect(r.attributes['gen_ai.response.id']).toBeUndefined()
      expect(r.attributes['gen_ai.response.model']).toBeUndefined()
    }

    // Duration histogram is per-run.
    const durationRecords = capture.histograms.filter(
      (h: any) => h.name === 'gen_ai.client.operation.duration',
    )
    expect(durationRecords.length).toBe(1)
    expect(durationRecords[0].unit).toBe('s')
    expect(
      durationRecords[0].attributes['gen_ai.response.model'],
    ).toBeUndefined()
  })

  test('otel middleware nests tool spans under the iteration span that triggered them', async ({
    page,
    testId,
    aimockPort,
    baseURL,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000)
    await page.locator('#mw-scenario-select').selectOption('with-tool')
    await page.locator('#mw-mode-select').selectOption('otel')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 15000 },
    )

    const capture = await fetchOtelCapture(page, baseURL, testId)

    // Every tool span carries gen_ai.tool.name + ended outcome. This also
    // guards against the "iteration span closed before onBeforeToolCall"
    // regression — if it regressed, onBeforeToolCall would skip span creation.
    const toolSpans = capture.spans.filter(
      (s: any) => 'gen_ai.tool.name' in s.attributes,
    )
    expect(toolSpans.length).toBeGreaterThanOrEqual(1)
    for (const tool of toolSpans) {
      expect(tool.ended).toBe(true)
      expect(tool.attributes['tanstack.ai.tool.outcome']).toBeDefined()
    }
  })

  test('otel middleware emits total/cache/reasoning usage details on spans', async ({
    request,
  }) => {
    // `/api/otel-usage` drives the OpenAI adapter against the
    // `/openai-usage-details` aimock mount (total_tokens + cached_tokens +
    // reasoning_tokens) with otelMiddleware attached, and returns the
    // captured spans. End-to-end proof for #721: the full TokenUsage reaches
    // span attributes, not just input/output tokens.
    const res = await request.post('/api/otel-usage', {
      data: { provider: 'openai' },
    })
    expect(res.ok()).toBe(true)
    const { ok, error, spans } = await res.json()
    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)

    const iterationSpans = spans.filter(
      (s: any) => s.kind === SpanKind.CLIENT && s.ended,
    )
    expect(iterationSpans.length).toBeGreaterThanOrEqual(1)
    expect(iterationSpans[0].attributes).toMatchObject({
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.output_tokens': 50,
      'gen_ai.usage.total_tokens': 150,
      'gen_ai.usage.cache_read.input_tokens': 80,
      'gen_ai.usage.reasoning.output_tokens': 30,
    })

    // The root span rolls up the final usage on onFinish.
    const rootSpans = spans.filter((s: any) => s.kind === SpanKind.INTERNAL)
    expect(rootSpans).toHaveLength(1)
    expect(rootSpans[0].attributes).toMatchObject({
      'gen_ai.usage.total_tokens': 150,
      'gen_ai.usage.cache_read.input_tokens': 80,
      'gen_ai.usage.reasoning.output_tokens': 30,
    })
  })

  test('otel middleware emits provider-reported cost on spans', async ({
    request,
  }) => {
    // OpenRouter adapter against the `/openrouter-cost` mount, whose trailing
    // usage chunk carries `cost` / `cost_details`. Backends like PostHog read
    // `gen_ai.usage.cost` directly instead of re-deriving from price tables.
    const res = await request.post('/api/otel-usage', {
      data: { provider: 'openrouter' },
    })
    expect(res.ok()).toBe(true)
    const { ok, error, spans } = await res.json()
    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)

    const iterationSpans = spans.filter(
      (s: any) => s.kind === SpanKind.CLIENT && s.ended,
    )
    expect(iterationSpans.length).toBeGreaterThanOrEqual(1)
    expect(iterationSpans[0].attributes).toMatchObject({
      'gen_ai.usage.input_tokens': 11,
      'gen_ai.usage.output_tokens': 3,
      'gen_ai.usage.total_tokens': 14,
      'gen_ai.usage.cost': 0.0042,
      'tanstack.ai.usage.upstream_cost': 0.0038,
      'tanstack.ai.usage.upstream_input_cost': 0.0012,
      'tanstack.ai.usage.upstream_output_cost': 0.0026,
    })

    const rootSpans = spans.filter((s: any) => s.kind === SpanKind.INTERNAL)
    expect(rootSpans).toHaveLength(1)
    expect(rootSpans[0].attributes['gen_ai.usage.cost']).toBe(0.0042)
  })

  test('otelMiddleware emits an image_generation span for generateImage', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // `/api/otel-media` drives generateImage with otelMiddleware against the
    // image-gen aimock mount and returns the captured spans. End-to-end proof
    // that the unified middleware tags a non-chat activity with the right
    // `gen_ai.operation.name` — the same `otelMiddleware` value used for chat,
    // passed through the media `middleware` slot.
    const res = await request.post('/api/otel-media', {
      data: {
        prompt: 'a guitar in a music store',
        provider: 'openai',
        testId,
        aimockPort,
      },
    })
    expect(res.ok()).toBe(true)
    const { ok, error, spans } = await res.json()
    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)

    const mediaSpans = spans.filter(
      (s: any) => s.attributes['gen_ai.operation.name'] === 'image_generation',
    )
    expect(mediaSpans).toHaveLength(1)
    expect(mediaSpans[0].kind).toBe(SpanKind.CLIENT)
    expect(mediaSpans[0].ended).toBe(true)
    expect(mediaSpans[0].attributes).toMatchObject({
      'gen_ai.system': 'openai',
      'gen_ai.operation.name': 'image_generation',
      'gen_ai.request.model': 'gpt-image-1',
    })
  })

  test('no middleware passes content through unchanged', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000)
    await page.locator('#mw-scenario-select').selectOption('basic-text')
    await page.locator('#mw-mode-select').selectOption('none')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const messagesJson = await page.locator('#mw-messages-json').textContent()
    const messages = JSON.parse(messagesJson || '[]')
    const assistantMsg = messages.find((m: any) => m.role === 'assistant')
    const textPart = assistantMsg?.parts?.find((p: any) => p.type === 'text')
    expect(textPart?.content).not.toContain('[MW]')
    expect(textPart?.content).toContain('Hello')
  })

  test('memory middleware injects recalled prompt + tools and defers save', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams()
    if (testId) params.set('testId', testId)
    if (aimockPort) params.set('aimockPort', String(aimockPort))
    const qs = params.toString()
    await page.goto(`/middleware-test${qs ? '?' + qs : ''}`)
    await page.waitForTimeout(2000) // hydration
    await page.locator('#mw-scenario-select').selectOption('basic-text')
    await page.locator('#mw-mode-select').selectOption('memory')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 10000 },
    )

    const memoryJson = await page.locator('#mw-memory-json').textContent()
    const capture = JSON.parse(memoryJson || '{}') as {
      configs: Array<{ systemPrompts: Array<string>; toolNames: Array<string> }>
      saveCount: number
    }

    // The recorder placed after memoryMiddleware saw the config the model
    // receives: the recalled system prompt (+ tool guidance) and the injected
    // tool must both be present.
    expect(capture.configs.length).toBeGreaterThan(0)
    const injected = capture.configs.find((c) =>
      c.systemPrompts.some((p) => p.includes('love TanStack')),
    )
    expect(injected).toBeTruthy()
    expect(injected?.systemPrompts.some((p) => p.includes('recall_more'))).toBe(
      true,
    )
    expect(injected?.toolNames).toContain('recall_more')

    // The finished turn deferred a save through the adapter.
    expect(capture.saveCount).toBeGreaterThanOrEqual(1)
  })
})
