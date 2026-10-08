import { expect, test } from '@playwright/test'

/**
 * An AG-UI producer that is not TanStack AI ends a run that calls a frontend
 * tool with a success outcome and leaves the call unanswered (issue #1464).
 * The client runs the tool, then starts one more run with the tool result in
 * its history.
 */
test.describe('frontend tool from a spec-compliant AG-UI server', () => {
  test('runs the tool and continues with its result', async ({ page }) => {
    const posts: Array<unknown> = []
    page.on('request', (request) => {
      if (
        request.url().includes('/api/foreign-client-tool') &&
        request.method() === 'POST'
      ) {
        posts.push(request.postDataJSON())
      }
    })

    await page.goto('/foreign-client-tool')

    await expect(page.getByTestId('ping-outputs')).toHaveText(
      '{"reply":"pong"}',
    )
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'ping returned {"reply":"pong"}',
    )
    expect(posts).toHaveLength(2)
  })
})
