import { test, expect } from './fixtures'

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
})
