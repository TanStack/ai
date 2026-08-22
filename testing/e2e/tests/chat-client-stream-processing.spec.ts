import { expect, test } from '@playwright/test'

test('ChatClient time-slices a large buffered stream', async ({ page }) => {
  await page.goto('/chat-client-stream-processing')

  await page.getByTestId('run').click()
  await expect(page.getByTestId('complete')).toHaveText('true')

  const result = JSON.parse(
    (await page.getByTestId('result').textContent()) ?? '{}',
  )
  expect(result).toEqual({
    contentChunkCount: 2_000,
    firstContentBeforeUserBlockingTask: true,
    longTaskObserverSupported: true,
    longTaskCount: 0,
    ordered: true,
    userBlockingTaskBeforeRunFinished: true,
  })
  await expect(page.getByTestId('loading')).toHaveText('false')
  await expect(page.getByTestId('error')).toHaveCount(0)
})
