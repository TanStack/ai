import { expect, test } from '@playwright/test'

test.describe('markdown CJK bold rendering', () => {
  test('CJK bold renders as <strong> without any plugin', async ({ page }) => {
    await page.goto('/markdown-cjk')
    const section = page.getByTestId('cjk-bold')
    // The literal "**" should be consumed by the bold parser.
    await expect(section).not.toContainText('**')
    const strong = section.locator('strong')
    await expect(strong).toHaveCount(1)
    await expect(strong).toHaveText('この文は太字になりません。')
  })
})
