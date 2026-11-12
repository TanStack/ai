import { expect, test } from '@playwright/test'

const errors: Array<string> = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('status')).toHaveText('ready')
})

test.afterEach(async ({ page }) => {
  if (await page.getByTestId('error').count()) {
    await expect(page.getByTestId('error')).toBeEmpty()
  }
  expect(errors).toEqual([])
})

test('streams partial and final messages through the public root import', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture alpha: first',
  )
  await expect(page.getByTestId('loading')).toHaveText('true')
  await expect(page.getByTestId('messages')).not.toContainText('complete')

  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture alpha: first complete',
  )
  await expect(page.getByTestId('loading')).toHaveText('false')
  await expect(page.getByTestId('finished')).toHaveText('1')
  await expect(page.getByTestId('active')).toHaveText('0')
})

test('reactive options preserve the transcript and reach the next request', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('loading')).toHaveText('true')
  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('finished')).toHaveText('1')
  await page.getByRole('button', { name: 'Change provider' }).click()
  await expect(page.getByTestId('provider')).toHaveText('beta')
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture alpha: first complete',
  )

  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('requests')).toHaveText(
    '[{"threadId":"thread-a","provider":"alpha","users":1},{"threadId":"thread-a","provider":"beta","users":2}]',
  )
  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('finished')).toHaveText('2')
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture beta: first complete',
  )
})

test('thread changes abort the previous stream and reset chat state', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture alpha: first',
  )
  await page.getByRole('button', { name: 'Switch thread' }).click()
  await expect(page.getByTestId('thread')).toHaveText('thread-b')
  await expect(page.getByTestId('aborted')).toHaveText('1')
  await expect(page.getByTestId('active')).toHaveText('0')
  await expect(page.getByTestId('messages')).toBeEmpty()
  await expect(page.getByTestId('loading')).toHaveText('false')

  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('requests')).toHaveText(
    '[{"threadId":"thread-a","provider":"alpha","users":1},{"threadId":"thread-b","provider":"alpha","users":1}]',
  )
  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('finished')).toHaveText('1')
})

test('owner disposal aborts the stream without a late finish callback', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('messages')).toContainText(
    'Fixture alpha: first',
  )
  await page.getByRole('button', { name: 'Unmount chat' }).click()
  await expect(page.getByTestId('messages')).toHaveCount(0)
  await expect(page.getByTestId('aborted')).toHaveText('1')
  await expect(page.getByTestId('active')).toHaveText('0')
  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('finished')).toHaveText('0')

  await page.getByRole('button', { name: 'Mount chat', exact: true }).click()
  await expect(page.getByTestId('messages')).toBeEmpty()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('loading')).toHaveText('true')
  await page.getByRole('button', { name: 'Release reply' }).click()
  await expect(page.getByTestId('finished')).toHaveText('1')
  await expect(page.getByTestId('active')).toHaveText('0')
})
