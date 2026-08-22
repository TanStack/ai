import { test, expect } from './fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getMessages,
  getToolCalls,
} from './tools-test/helpers'

test.describe('Tool Error Handling', () => {
  test('tool that throws error produces error result and chat continues', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'tool-error', testId, aimockPort)
    await runTest(page)

    // The agentic loop should handle the tool error and continue
    // (the tool throws, error becomes the tool result, LLM responds to the error)
    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    // Tool was called even though it threw
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)

    const toolCalls = await getToolCalls(page)
    const failingCall = toolCalls.find(
      (tc: { name: string }) => tc.name === 'failing_tool',
    )
    expect(failingCall).toBeDefined()
    // The failed tool-call part reaches the terminal 'error' state, so UIs can
    // distinguish "failed" from "still executing" without reverse-engineering
    // the output shape (issue #718).
    expect(failingCall?.state).toBe('error')
  })

  test('malformed tool arguments produce an error result and chat continues', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'malformed-tool-arguments', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    expect(metadata.hasError).toBe('false')

    const toolCalls = await getToolCalls(page)
    expect(toolCalls).toContainEqual(
      expect.objectContaining({ name: 'check_status', state: 'error' }),
    )

    const messages = await getMessages(page)
    const responseText = messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(' ')
    expect(responseText).toContain('Recovered from malformed tool arguments.')
  })

  test('provider-rejected tool call produces an error result and chat continues', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(
      page,
      'provider-rejected-tool-call',
      testId,
      aimockPort,
    )
    await runTest(page)
    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    expect(metadata.hasError).toBe('false')

    const toolCalls = await getToolCalls(page)
    expect(toolCalls).toContainEqual(
      expect.objectContaining({ name: 'check_status', state: 'error' }),
    )

    const messages = await getMessages(page)
    const responseText = messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(' ')
    expect(responseText).toContain(
      'Recovered from provider-rejected tool call.',
    )
  })

  test('server-owned client tool input error does not start another request', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const requestBodies: Array<any> = []
    page.on('request', (request) => {
      if (
        request.url().includes('/api/tools-test') &&
        request.method() === 'POST'
      ) {
        const body = request.postDataJSON()
        if (body) requestBodies.push(body)
      }
    })

    await selectScenario(page, 'client-tool-input-error', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 1)
    await page.waitForFunction(
      () =>
        document
          .getElementById('test-metadata')
          ?.getAttribute('data-is-loading') === 'false',
    )

    const metadata = await getMetadata(page)
    expect(metadata.hasError).toBe('false')
    expect(metadata.executionCompleteCount).toBe('0')

    const toolCalls = await getToolCalls(page)
    expect(toolCalls).toContainEqual(
      expect.objectContaining({ name: 'show_notification', state: 'error' }),
    )

    const messages = await getMessages(page)
    const toolResult = messages
      .flatMap((message) => message.parts)
      .find((part) => part.type === 'tool-result')
    expect(toolResult?.content).toContain('Input validation failed')
    expect(requestBodies).toHaveLength(1)
    expect(requestBodies[0]?.resume).toBeUndefined()
  })
})
