import type { Page } from '@playwright/test'

export async function sendMessage(page: Page, text: string) {
  const input = page.getByTestId('chat-input')
  await input.click()
  await input.fill(text)
  // Dispatch an input event to trigger React's onChange for controlled inputs
  await input.dispatchEvent('input', { bubbles: true })
  await page.getByTestId('send-button').click({ timeout: 5000 }).catch(async () => {
    // Fallback: if fill() didn't trigger React state, use pressSequentially
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
  await input.pressSequentially(text, { delay: 10 })
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
