import { expect, test } from '@playwright/test'

/**
 * An AG-UI producer that is not TanStack AI ends a run that calls a frontend
 * tool and leaves the call unanswered. It ends the run with a success outcome
 * (issue #1464), or with finishReason 'tool_calls', as a custom server that
 * forwards the provider finish reason does. The client runs the tool, then
 * starts one more run with the tool result in its history.
 */
test.describe('frontend tool from a spec-compliant AG-UI server', () => {
  for (const finish of ['success', 'tool_calls']) {
    test(`runs the tool and continues with its result (${finish})`, async ({
      page,
    }) => {
      const posts: Array<unknown> = []
      page.on('request', (request) => {
        if (
          request.url().includes('/api/foreign-client-tool') &&
          request.method() === 'POST'
        ) {
          posts.push(request.postDataJSON())
        }
      })

      await page.goto(`/foreign-client-tool?finish=${finish}`)

      await page.getByTestId('send').click()

      await expect(page.getByTestId('ping-outputs')).toHaveText(
        '{"reply":"pong"}',
      )
      await expect(page.getByTestId('assistant-text')).toHaveText(
        'ping returned {"reply":"pong"}',
      )
      expect(posts).toHaveLength(2)
    })
  }

  for (const finish of ['success', 'tool_calls']) {
    for (const [button, sent] of [
      ['Approve', 'ping returned {"reply":"pong"}'],
      ['Deny', 'User declined tool execution'],
    ]) {
      test(`asks for approval of a tool that needs it (${finish}, ${button})`, async ({
        page,
      }) => {
        await page.goto(`/foreign-client-tool?finish=${finish}&approval=1`)
        await page.getByTestId('send').click()

        await page
          .getByTestId('approval')
          .getByRole('button', { name: button })
          .click()

        await expect(page.getByTestId('assistant-text')).toContainText(sent)
        await expect(page.getByTestId('approval')).toHaveCount(0)
      })
    }
  }

  test('keeps a queued message until the approval is answered', async ({
    page,
  }) => {
    const posts: Array<string> = []
    page.on('request', (request) => {
      if (
        request.url().includes('/api/foreign-client-tool') &&
        request.method() === 'POST'
      ) {
        posts.push(request.postData() ?? '')
      }
    })

    await page.goto('/foreign-client-tool?approval=1&queue=1')

    await page.getByTestId('send').click()
    const approve = page
      .getByTestId('approval')
      .getByRole('button', { name: 'Approve' })
    await expect(approve).toBeVisible()
    expect(posts).toHaveLength(1)

    await approve.click()

    // The run with the tool result goes first. The queued message follows.
    await expect.poll(() => posts.length).toBe(3)
    expect(posts[1]).not.toContain('queued')
    expect(posts[2]).toContain('queued')
  })
})
