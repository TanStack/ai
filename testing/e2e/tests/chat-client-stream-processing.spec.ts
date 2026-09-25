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
    longTaskCount: expect.any(Number),
    ordered: true,
    userBlockingTaskBeforeRunFinished: true,
  })
  // Allow one long task for slow CI runners (GC, a slow render). A drain with
  // no yield still fails `userBlockingTaskBeforeRunFinished` above.
  expect(result.longTaskCount).toBeLessThanOrEqual(1)
  await expect(page.getByTestId('assistant-text')).toHaveText(
    Array.from({ length: 2_000 }, (_, index) => String(index)).join(''),
  )
  await expect(page.getByTestId('loading')).toHaveText('false')
  await expect(page.getByTestId('error')).toHaveCount(0)
})
