import { expect, test } from '@playwright/test'

test.describe('markdown CJK bold rendering', () => {
  test('without remark-cjk-friendly, CJK bold does NOT render as <strong>', async ({
    page,
  }) => {
    await page.goto('/markdown-cjk')
    const without = page.getByTestId('without-plugin')
    // The literal "**" should still be visible because the bold parser fails.
    await expect(without).toContainText('**')
    // No <strong> should appear inside the without-plugin section.
    await expect(without.locator('strong')).toHaveCount(0)
  })

  test('with remark-cjk-friendly, CJK bold renders as <strong>', async ({
    page,
  }) => {
    await page.goto('/markdown-cjk')
    const withPlugin = page.getByTestId('with-plugin')
    // The literal "**" should be consumed by the bold parser.
    await expect(withPlugin).not.toContainText('**')
    // The Japanese run should now be inside a <strong>.
    const strong = withPlugin.locator('strong')
    await expect(strong).toHaveCount(1)
    await expect(strong).toHaveText('この文は太字になりません。')
  })
})
