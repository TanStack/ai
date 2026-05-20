import { test, expect } from '../fixtures'
import { getMessages } from './helpers'

test.describe('Server Tool History Hydration', () => {
  test('hydrates server tool-call output from a matching tool result', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const params = new URLSearchParams({
      historyFixture: 'server-tool-result',
      testId,
      aimockPort: String(aimockPort),
    })

    await page.goto(`/tools-test?${params.toString()}`)
    await page.waitForSelector('#run-test-button')

    await page.waitForFunction(
      () => {
        const messagesEl = document.getElementById('messages-json-content')
        const messages = JSON.parse(messagesEl?.textContent || '[]')
        const toolCall = messages
          .flatMap((msg: any) => msg.parts || [])
          .find(
            (part: any) =>
              part.type === 'tool-call' && part.id === 'history-tc-1',
          )

        return toolCall?.state === 'complete' && toolCall.output !== undefined
      },
      { timeout: 10000 },
    )

    const messages = await getMessages(page)
    const assistant = messages.find((message) => message.role === 'assistant')
    const toolCall = assistant?.parts.find(
      (part: any) => part.type === 'tool-call' && part.id === 'history-tc-1',
    )
    const toolResult = assistant?.parts.find(
      (part: any) =>
        part.type === 'tool-result' && part.toolCallId === 'history-tc-1',
    )

    expect(toolCall).toMatchObject({
      type: 'tool-call',
      id: 'history-tc-1',
      name: 'getWeather',
      arguments: '{"city":"NYC"}',
      state: 'complete',
      output: {
        temp: 72,
        condition: 'sunny',
      },
    })

    expect(toolResult).toMatchObject({
      type: 'tool-result',
      toolCallId: 'history-tc-1',
      content: '{"temp":72,"condition":"sunny"}',
      state: 'complete',
    })
  })
})
