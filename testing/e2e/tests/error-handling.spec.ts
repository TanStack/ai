import { createServer } from 'node:http'
import { GenerationClient } from '@tanstack/ai-client'
import { test, expect } from './fixtures'
import { selectScenario, runTest, getMetadata } from './tools-test/helpers'
import { sendMessage, featureUrl } from './helpers'

test.describe('Error Handling', () => {
  test('closes a generation fetcher response after RUN_ERROR', async () => {
    let responseClosed = false
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.once('close', () => {
        responseClosed = true
      })
      response.write(
        'data: {"type":"RUN_ERROR","message":"generation failed"}\n\n',
      )
    })
    const client = new GenerationClient({
      fetcher: async (_input, { signal }) => {
        const address = server.address()
        if (!address || typeof address === 'string')
          throw new Error('Missing test server port')
        return fetch(`http://127.0.0.1:${address.port}`, { signal })
      },
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      await client.generate({})
      expect(client.getError()?.message).toBe('generation failed')
      expect(client.getIsLoading()).toBe(false)
      await expect.poll(() => responseClosed).toBe(true)
    } finally {
      client.dispose()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('closes the HTTP response after a stream parse error', async ({
    page,
    testId,
    aimockPort,
  }) => {
    let responseClosed = false
    // Keep the response open so only client cleanup can close the connection.
    const server = createServer((request, response) => {
      request.resume()
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (request.method === 'OPTIONS') {
        response.writeHead(204).end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.once('close', () => {
        responseClosed = true
      })
      response.write('data: {invalid json}\n\n')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing test server port')
      await page.route('**/api/tools-test', (route) =>
        route.continue({ url: `http://127.0.0.1:${address.port}` }),
      )
      await selectScenario(page, 'error', testId, aimockPort)
      await runTest(page)
      await expect(page.locator('#error-display')).toBeVisible()
      await expect(page.locator('#test-metadata')).toHaveAttribute(
        'data-is-loading',
        'false',
      )
      await expect.poll(() => responseClosed).toBe(true)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('displays error when server returns RUN_ERROR', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'error', testId, aimockPort)
    await runTest(page)

    // Wait for error to appear
    await page.waitForFunction(
      () =>
        document
          .querySelector('#test-metadata')
          ?.getAttribute('data-has-error') === 'true',
      { timeout: 10000 },
    )

    const metadata = await getMetadata(page)
    expect(metadata.hasError).toBe('true')
    expect(metadata.isLoading).toBe('false')

    // Error should be visible in UI
    await expect(page.locator('#error-display')).toBeVisible()
  })

  test('RUN_ERROR rawEvent survives transport and reaches the consumer', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'error', testId, aimockPort)
    await runTest(page)

    await page.waitForFunction(
      () =>
        document
          .querySelector('#test-metadata')
          ?.getAttribute('data-has-error') === 'true',
      { timeout: 10000 },
    )

    // The provider's structured error body forwarded as RUN_ERROR.rawEvent must
    // survive SSE transport + the strip-to-spec middleware and be recoverable
    // on the consumer-facing error.
    const metadata = await getMetadata(page)
    expect(metadata.errorRawEvent).not.toBe('')
    expect(JSON.parse(metadata.errorRawEvent)).toEqual({
      provider_name: 'test-provider',
      raw: { reason: 'upstream overloaded' },
    })
  })

  // Fixture loaded from fixtures/error/basic.json (static, shared across workers)
  test('aimock error fixture returns error to client', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    await sendMessage(page, '[error-test] trigger server error')

    // Wait for loading to finish (error completes the stream)
    await page.waitForTimeout(5000)

    // Should not be loading
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible()

    // Error response should not produce a normal assistant message with content
    const assistantMsgs = page.getByTestId('assistant-message')
    const count = await assistantMsgs.count()
    if (count > 0) {
      const text = await assistantMsgs.last().innerText()
      expect(text).not.toContain('recommend')
      expect(text).not.toContain('guitar')
    }
  })
})
