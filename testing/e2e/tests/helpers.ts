import { expect, type Page } from '@playwright/test'

export function featureUrl(
  provider: string,
  feature: string,
  testId: string,
  aimockPort: number,
  mode?: string,
): string {
  let url = `/${provider}/${feature}?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`
  if (mode) url += `&mode=${mode}`
  return url
}

export async function sendMessage(page: Page, text: string) {
  const input = page.getByTestId('chat-input')
  await input.click()
  await input.fill(text)
  // Dispatch an input event to trigger React's onChange for controlled inputs
  await input.dispatchEvent('input', { bubbles: true })
  await page
    .getByTestId('send-button')
    .click({ timeout: 5000 })
    .catch(async (err) => {
      // Only retry if button was disabled (fill() didn't trigger React onChange)
      const isDisabled = await page.getByTestId('send-button').isDisabled()
      if (!isDisabled) throw err
      await input.clear()
      await input.pressSequentially(text, { delay: 30 })
      await page.getByTestId('send-button').click()
    })
}

export async function sendMessageWithImage(
  page: Page,
  text: string,
  imagePath: string,
) {
  const input = page.getByTestId('chat-input')
  await input.click()
  await input.pressSequentially(text, { delay: 30 })
  // Wait for React state to settle before attaching file
  await page.waitForTimeout(200)
  await page.getByTestId('image-attachment-input').setInputFiles(imagePath)
}

export async function waitForResponse(page: Page, timeout = 15_000) {
  try {
    await page
      .getByTestId('loading-indicator')
      .waitFor({ state: 'visible', timeout: 5_000 })
  } catch {
    // Loading may have already finished
  }
  await page
    .getByTestId('loading-indicator')
    .waitFor({ state: 'hidden', timeout })
}

export async function getLastAssistantMessage(page: Page): Promise<string> {
  const messages = page.getByTestId('assistant-message')
  const count = await messages.count()
  if (count === 0) return ''
  return messages.nth(count - 1).innerText()
}

/** Wait for an assistant message containing specific text (useful for tool-calling where
 *  the agentic loop produces multiple responses and waitForResponse returns too early) */
export async function waitForAssistantText(
  page: Page,
  text: string,
  timeout = 15_000,
) {
  await page
    .getByTestId('assistant-message')
    .filter({ hasText: text })
    .first()
    .waitFor({ state: 'visible', timeout })
}

export async function getToolCalls(
  page: Page,
): Promise<Array<{ name: string }>> {
  const toolCalls: Array<{ name: string }> = []
  const elements = page.locator('[data-testid^="tool-call-"]').filter({
    hasNot: page.locator('[data-testid^="tool-call-result-"]'),
  })
  const count = await elements.count()
  for (let i = 0; i < count; i++) {
    const testId = await elements.nth(i).getAttribute('data-testid')
    if (testId && testId.startsWith('tool-call-')) {
      toolCalls.push({ name: testId.replace('tool-call-', '') })
    }
  }
  return toolCalls
}

export async function getStructuredOutput(page: Page): Promise<string> {
  return page.getByTestId('structured-output').innerText()
}

export async function approveToolCall(page: Page, toolName: string) {
  await page.getByTestId(`approve-button-${toolName}`).click()
}

export async function denyToolCall(page: Page, toolName: string) {
  await page.getByTestId(`deny-button-${toolName}`).click()
}

export async function isNotSupported(page: Page): Promise<boolean> {
  return page
    .getByTestId('not-supported')
    .isVisible({ timeout: 2_000 })
    .catch(() => false)
}

export async function submitSummarization(page: Page, text: string) {
  const input = page.getByTestId('summarize-input')
  await input.click()
  await input.pressSequentially(text, { delay: 10 })
  await page.getByTestId('summarize-button').click()
}

export async function getSummarizationResult(page: Page): Promise<string> {
  await page
    .getByTestId('summarize-result')
    .waitFor({ state: 'visible', timeout: 15_000 })
  return page.getByTestId('summarize-result').innerText()
}

export async function getAudioPlayer(page: Page) {
  return page.getByTestId('audio-player')
}

export async function getTranscriptionResult(page: Page): Promise<string> {
  await page
    .getByTestId('transcription-result')
    .waitFor({ state: 'visible', timeout: 15_000 })
  return page.getByTestId('transcription-result').innerText()
}

export async function fillPrompt(page: Page, text: string) {
  const input = page.getByTestId('prompt-input')
  await input.click()
  await input.fill(text)
  await input.dispatchEvent('input', { bubbles: true })
  // If fill() didn't trigger React onChange, fall back to pressSequentially
  const btn = page.getByTestId('generate-button')
  if (await btn.isDisabled()) {
    await input.clear()
    await input.pressSequentially(text, { delay: 30 })
  }
}

export async function fillTextInput(page: Page, text: string) {
  const input = page.getByTestId('text-input')
  await input.click()
  await input.fill(text)
  await input.dispatchEvent('input', { bubbles: true })
  // If fill() didn't trigger React onChange, fall back to pressSequentially
  const btn = page.getByTestId('generate-button')
  if (await btn.isDisabled()) {
    await input.clear()
    await input.pressSequentially(text, { delay: 30 })
  }
}

export async function clickGenerate(page: Page) {
  // Wait for full page load (including hydration scripts)
  await page.waitForLoadState('networkidle')
  const btn = page.getByTestId('generate-button')
  await btn.click()
  // Verify the click actually triggered React — status should leave 'idle'
  // If still idle after a short wait, the click missed hydration; retry
  try {
    await expect(page.getByTestId('generation-status')).not.toHaveText('idle', {
      timeout: 3_000,
    })
  } catch {
    // Retry click — hydration likely wasn't complete on first attempt
    await btn.click()
  }
}

export async function waitForGenerationComplete(page: Page, timeout = 30_000) {
  await expect(page.getByTestId('generation-status')).toHaveText('complete', {
    timeout,
  })
}
