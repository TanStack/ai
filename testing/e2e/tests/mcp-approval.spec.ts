import { expect, test } from './fixtures'
import { devtoolsUrl } from './devtools-helpers'

// An MCP tool gated with needsApproval has no client definition in the
// browser. useChat must still surface it as an approval the user can act on.
test.describe('mcp approval — server-only tool in useChat', () => {
  test('surfaces the gated MCP call as server-tool-approval and resumes on approve', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(devtoolsUrl('/mcp-approval', testId, aimockPort))

    await expect(page.getByTestId('interrupt-kind')).toHaveText(
      'server-tool-approval',
    )
    await expect(page.getByTestId('interrupt-tool')).toHaveText(
      'get_guitar_price',
    )
    await expect(page.getByTestId('interrupt-args')).toHaveText(
      '{"id":"strat"}',
    )

    await page.getByTestId('approve').click()

    await expect(page.getByTestId('interrupt')).toHaveCount(0)
    await expect(page.getByTestId('assistant-text')).toContainText(
      'The strat guitar costs $1999.',
    )
  })
})
