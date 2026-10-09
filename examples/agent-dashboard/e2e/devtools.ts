import type { Page } from '@playwright/test'

// The demo controls now live in a custom TanStack DevTools panel (see
// src/components/demo-controls.tsx). Under E2E the panel opens on load
// (VITE_E2E, see playwright.config.ts), so demo controls are reachable by
// default. The open panel is a fixed overlay along the bottom, so it can cover
// bottom-of-page product controls (the message box, roster "run" buttons) —
// close it before clicking those, reopen before the next demo control.

const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Open TanStack Devtools' })

/** Open the demo-controls panel if it's currently closed. */
export async function openDemo(page: Page) {
  // When the panel is open the trigger is hidden; if it's visible, we're closed.
  if (
    await trigger(page)
      .isVisible()
      .catch(() => false)
  ) {
    await trigger(page).click()
  }
}

/** Close the panel so bottom-of-page product controls are clickable. */
export async function closeDemo(page: Page) {
  if (
    await trigger(page)
      .isVisible()
      .catch(() => false)
  )
    return // already closed
  await page.locator('button.close').first().click()
}

export async function answerAgentQuestion(page: Page) {
  // The question card sits at the bottom of the stream, under the open panel.
  await closeDemo(page)
  await page.getByText('Agent question').first().waitFor()
  // A `permissions()` ask: allow this one call.
  await page.getByRole('button', { name: 'once', exact: true }).first().click()
}
