/**
 * Test helpers for E2E vendor tests
 */

import type { Page, APIRequestContext } from '@playwright/test'
import type { ProviderId, ProviderConfig } from './vendor-config'

/**
 * Select a provider/model from the model dropdown on the chat page
 */
export async function selectProvider(
  page: Page,
  provider: ProviderId,
  model: string,
): Promise<void> {
  // The model selector shows labels like "OpenAI - GPT-4o"
  // We need to find the option that matches our provider and model
  const select = page.locator('select').first()
  await select.waitFor({ state: 'visible' })

  // Get all options and find the one matching our provider/model
  const options = await select.locator('option').all()
  let targetIndex = -1

  for (let i = 0; i < options.length; i++) {
    const text = await options[i].textContent()
    // Match by provider name in the label (e.g., "OpenAI - GPT-4o")
    const providerName = getProviderDisplayName(provider)
    if (text?.includes(providerName) && text?.includes(model)) {
      targetIndex = i
      break
    }
    // Also match if model contains the text (for models like "gpt-4o-mini")
    if (text?.includes(providerName)) {
      // Check if this is the model we want by looking at model substring
      const modelPart = model.split('/').pop() || model // Handle openrouter models like "openai/gpt-4o"
      if (text?.toLowerCase().includes(modelPart.toLowerCase())) {
        targetIndex = i
        break
      }
    }
  }

  // If we found a match, select it; otherwise try to find by provider only
  if (targetIndex === -1) {
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].textContent()
      const providerName = getProviderDisplayName(provider)
      if (text?.includes(providerName)) {
        targetIndex = i
        break
      }
    }
  }

  if (targetIndex >= 0) {
    await select.selectOption({ index: targetIndex })
  } else {
    throw new Error(
      `Could not find model option for provider: ${provider}, model: ${model}`,
    )
  }
}

/**
 * Get the display name for a provider (as shown in the UI)
 */
function getProviderDisplayName(provider: ProviderId): string {
  const names: Record<ProviderId, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    ollama: 'Ollama',
    grok: 'Grok',
    openrouter: 'OpenRouter',
  }
  return names[provider]
}

/**
 * Send a message in the chat UI
 */
export async function sendMessage(page: Page, message: string): Promise<void> {
  // Find the textarea input
  const textarea = page.locator('textarea').first()
  await textarea.waitFor({ state: 'visible' })

  // Click to focus and clear any existing content
  await textarea.click()
  await textarea.fill('')

  // Type the message character by character to properly trigger React state updates
  await textarea.pressSequentially(message, { delay: 10 })

  // Verify the input has the message
  await textarea.waitFor({ state: 'visible' })

  // Use keyboard Enter to send (more reliable than finding the button)
  // The chat UI handles Enter key to send messages
  await textarea.press('Enter')
}

/**
 * Wait for the assistant response to complete
 */
export async function waitForResponse(
  page: Page,
  timeout: number = 60_000,
): Promise<void> {
  // Wait for loading to start - the stop button should appear or we see loading indicator
  const stopButton = page.locator('button:has-text("Stop")')

  // First, wait a moment for loading to potentially start
  await page.waitForTimeout(1000)

  // Check if loading started by looking for the stop button
  const loadingStarted = await stopButton.isVisible().catch(() => false)

  if (loadingStarted) {
    // Wait for loading to complete (stop button to disappear)
    try {
      await stopButton.waitFor({ state: 'hidden', timeout: timeout - 1000 })
    } catch {
      // Stop button might still be visible if test times out
    }
  } else {
    // Loading might have been too fast or there's an error
    // Wait for either an assistant message or an error to appear
    const messagesJson = page
      .locator('pre')
      .filter({ hasText: '"role"' })
      .first()
    try {
      // Wait for the messages JSON to contain an assistant message
      await page.waitForFunction(
        () => {
          const preElements = document.querySelectorAll('pre')
          for (const pre of preElements) {
            const text = pre.textContent || ''
            if (text.includes('"assistant"')) {
              return true
            }
          }
          return false
        },
        { timeout: timeout - 1000 },
      )
    } catch {
      // Timeout waiting for response
    }
  }

  // Additional wait for message to fully render
  await page.waitForTimeout(500)
}

/**
 * Get the last assistant message text from the chat
 */
export async function getAssistantMessage(page: Page): Promise<string> {
  // First try to get messages from the debug panel JSON
  const messages = await getMessages(page)

  // Find the last assistant message (searching from the end)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant') {
      // Extract text content from parts
      const textParts = msg.parts?.filter(
        (p: any) => p.type === 'text' && p.content,
      )
      if (textParts?.length > 0) {
        return textParts.map((p: any) => p.content).join(' ')
      }
      // If no text parts, check if there's direct content
      if (msg.content) {
        return msg.content
      }
    }
  }

  // Fallback: try to get text from the rendered chat messages
  // Look for the AI indicator badge and get the adjacent prose content
  try {
    // The chat shows messages with an "AI" badge for assistant messages
    // Get all message containers and find ones with assistant role indicator
    const aiMessages = page.locator('.rounded-lg.mb-2').filter({
      has: page.locator('text="AI"'),
    })
    const count = await aiMessages.count()
    if (count > 0) {
      const lastAiMessage = aiMessages.last()
      const proseContent = lastAiMessage.locator('.prose')
      if ((await proseContent.count()) > 0) {
        const textContent = await proseContent
          .first()
          .textContent({ timeout: 5000 })
        return textContent || ''
      }
    }
  } catch {
    // Ignore errors in fallback
  }

  return ''
}

/**
 * Get all messages as parsed JSON from the debug panel
 */
export async function getMessages(page: Page): Promise<any[]> {
  const messagesJson = page.locator('pre').filter({ hasText: '"role"' }).first()

  try {
    const jsonText = await messagesJson.textContent({ timeout: 5000 })
    if (jsonText) {
      return JSON.parse(jsonText)
    }
  } catch {
    // Return empty array if parsing fails
  }

  return []
}

/**
 * Check if the last message has tool calls
 */
export async function hasToolCalls(page: Page): Promise<boolean> {
  const messages = await getMessages(page)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const toolCalls = messages[i].parts?.filter(
        (p: any) => p.type === 'tool-call',
      )
      return toolCalls?.length > 0
    }
  }
  return false
}

/**
 * Get tool call names from the last assistant message
 */
export async function getToolCallNames(page: Page): Promise<string[]> {
  const messages = await getMessages(page)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const toolCalls = messages[i].parts?.filter(
        (p: any) => p.type === 'tool-call',
      )
      return toolCalls?.map((tc: any) => tc.name) || []
    }
  }
  return []
}

/**
 * Options for summarization API call
 */
export interface SummarizeOptions {
  text: string
  provider: ProviderId
  model?: string
  maxLength?: number
  style?: 'concise' | 'detailed' | 'bullet-points'
  stream?: boolean
}

/**
 * Call the summarize API directly (non-streaming)
 */
export async function callSummarizeAPI(
  request: APIRequestContext,
  baseURL: string,
  options: SummarizeOptions,
): Promise<{ summary: string; provider: string; model: string }> {
  const response = await request.post(`${baseURL}/api/summarize`, {
    data: {
      text: options.text,
      provider: options.provider,
      model: options.model,
      maxLength: options.maxLength || 100,
      style: options.style || 'concise',
      stream: false,
    },
  })

  if (!response.ok()) {
    const errorBody = await response.text()
    throw new Error(`Summarize API failed: ${response.status()} - ${errorBody}`)
  }

  return response.json()
}

/**
 * Call the summarize API with streaming
 */
export async function callSummarizeAPIStreaming(
  request: APIRequestContext,
  baseURL: string,
  options: SummarizeOptions,
): Promise<{
  summary: string
  provider: string
  model: string
  chunkCount: number
}> {
  const response = await request.post(`${baseURL}/api/summarize`, {
    data: {
      text: options.text,
      provider: options.provider,
      model: options.model,
      maxLength: options.maxLength || 100,
      style: options.style || 'concise',
      stream: true,
    },
  })

  if (!response.ok()) {
    const errorBody = await response.text()
    throw new Error(
      `Summarize API streaming failed: ${response.status()} - ${errorBody}`,
    )
  }

  // Parse SSE response
  const text = await response.text()
  const lines = text.split('\n')

  let summary = ''
  let provider = ''
  let model = ''
  let chunkCount = 0

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'error') {
          throw new Error(parsed.error)
        }
        if (parsed.type === 'TEXT_MESSAGE_CONTENT') {
          chunkCount++
          if (parsed.delta) {
            summary += parsed.delta
          } else if (parsed.content) {
            summary = parsed.content
          }
          provider = parsed.provider || provider
          model = parsed.model || model
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return { summary, provider, model, chunkCount }
}

/**
 * Sample text for summarization tests
 */
export const SAMPLE_TEXT_FOR_SUMMARIZATION = `Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to natural intelligence displayed by animals including humans. AI research has been defined as the field of study of intelligent agents, which refers to any system that perceives its environment and takes actions that maximize its chance of achieving its goals.

The term "artificial intelligence" had previously been used to describe machines that mimic and display "human" cognitive skills that are associated with the human mind, such as "learning" and "problem-solving". This definition has since been rejected by major AI researchers who now describe AI in terms of rationality and acting rationally, which does not limit how intelligence can be articulated.

AI applications include advanced web search engines, recommendation systems, understanding human speech, self-driving cars, automated decision-making and competing at the highest level in strategic game systems. As machines become increasingly capable, tasks considered to require "intelligence" are often removed from the definition of AI, a phenomenon known as the AI effect.`

/**
 * Navigate to the chat page and wait for it to load
 */
export async function goToChatPage(page: Page): Promise<void> {
  await page.goto('/')
  // Wait for the model selector to be visible
  await page.locator('select').first().waitFor({ state: 'visible' })
  // Wait a bit for hydration
  await page.waitForTimeout(500)
}

/**
 * Navigate to the summarize page and wait for it to load
 */
export async function goToSummarizePage(page: Page): Promise<void> {
  await page.goto('/summarize')
  // Wait for the provider selector to be visible
  await page.locator('select').first().waitFor({ state: 'visible' })
  // Wait a bit for hydration
  await page.waitForTimeout(500)
}
