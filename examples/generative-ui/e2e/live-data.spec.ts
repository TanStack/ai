import { test, expect } from '@playwright/test'

/**
 * Live data sources, end to end, without an LLM. The Frame tab renders the
 * seeded `live-spend-monitor` fixture, which is bound to the host `spendFeed`
 * source. The host streams values over `/api/live`, the renderer pushes them
 * into the sandboxed iframe, and the view updates in place.
 */

test('the app loads', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByText('Open Generative UI', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Frame/ })).toBeVisible()
})

test('/api/live streams changing values from a data source', async ({
  page,
}) => {
  await page.goto('/')

  // Open the SSE stream in the page context and collect a few totals.
  const totals = await page.evaluate(
    () =>
      new Promise<Array<number>>((resolve) => {
        const url =
          '/api/live?source=spendFeed&params=' +
          encodeURIComponent(JSON.stringify({ intervalMs: 300 }))
        const es = new EventSource(url)
        const got: Array<number> = []
        es.onmessage = (e) => {
          const value = JSON.parse(e.data)
          if (typeof value.total === 'number') got.push(value.total)
          if (got.length >= 3) {
            es.close()
            resolve(got)
          }
        }
        setTimeout(() => {
          es.close()
          resolve(got)
        }, 8000)
      }),
  )

  expect(totals.length).toBeGreaterThanOrEqual(2)
  // The running total changes over time.
  expect(new Set(totals).size).toBeGreaterThan(1)
})

test('the live spend monitor updates in real time in the Frame tab', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Frame/ }).click()

  // The fixture renders in a sandboxed iframe titled after the artifact.
  const frame = page.frameLocator('iframe[title="Live spend monitor"]')
  const total = frame.getByText(/^\$[\d,]+$/)

  // The feed emits on subscribe, so the total leaves $0 on its own.
  await expect(total).toBeVisible({ timeout: 20_000 })
  await expect(total).not.toHaveText('$0', { timeout: 20_000 })

  // It keeps changing without any user action.
  const first = await total.textContent()
  await expect(async () => {
    const now = await total.textContent()
    expect(now).not.toBe(first)
  }).toPass({ timeout: 15_000 })
})
