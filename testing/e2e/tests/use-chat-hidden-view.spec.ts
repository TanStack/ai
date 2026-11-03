import { expect, test } from '@playwright/test'
import { sendMessage } from './helpers'

/**
 * A `useChat` view that `<Activity>` hides while a reply streams. When the view
 * shows again, `useChat` loads the thread, joins the run, and shows the rest of
 * the reply.
 *
 * Provider-free: `/api/use-chat-hidden-view` streams a fixed reply that waits
 * for the test before its second half, so there is nothing to mock.
 */
test('a hidden chat shows the rest of the reply when it shows again', async ({
  page,
}, testInfo) => {
  const thread = encodeURIComponent(`hidden-view-${testInfo.testId}`)
  await page.goto(`/use-chat-hidden-view?thread=${thread}`)

  await sendMessage(page, 'tell me in two halves')
  const reply = page.getByTestId('assistant-message')
  await expect(reply).toHaveText('HIDDEN_VIEW the first half,')

  await page.getByTestId('toggle-view').click()
  // ponytail: useChat disposes a hidden client one tick after the hide, 100 ms covers it.
  await page.waitForTimeout(100)
  // The shown chat joins the run (`?offset=-1`). Only then the run ends.
  const joined = page.waitForRequest((request) =>
    request.url().includes('/api/use-chat-hidden-view?offset=-1'),
  )
  await page.getByTestId('toggle-view').click()
  await joined
  await page.request.post(
    `/api/use-chat-hidden-view?action=finish&threadId=${thread}`,
  )

  await expect(reply).toHaveText(
    'HIDDEN_VIEW the first half, and the second half.',
  )
})
