import { test, expect } from './fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getToolCalls,
  getMessages,
} from './tools-test/helpers'

test.describe('Lazy Tool Discovery', () => {
  test('discovers and uses lazy tool', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'lazy-tool-discovery', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 20000, 2)

    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)

    const toolCalls = await getToolCalls(page)
    const toolNames = toolCalls.map((tc: any) => tc.name)
    expect(toolNames).toContain('__lazy__tool__discovery__')
    expect(toolNames).toContain('search_inventory')
  })

  test('discovery of an already offered tool returns it, not "Unknown tool"', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(
      page,
      'lazy-tool-discovery-offered',
      testId,
      aimockPort,
    )
    await runTest(page)
    await waitForTestComplete(page, 20000, 2)

    const toolCalls = await getToolCalls(page)
    expect(toolCalls.map((tc: any) => tc.name)).toEqual([
      '__lazy__tool__discovery__',
      'get_weather',
    ])

    const messages = await getMessages(page)
    const discoveryResult = messages
      .flatMap((m: any) => m.parts)
      .find(
        (p: any) =>
          p.type === 'tool-result' && p.toolCallId === toolCalls[0].id,
      )
    expect(discoveryResult?.content).not.toContain('Unknown tool')
  })
})
