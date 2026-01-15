import OpenAI from 'openai'

export interface ClientConfig {
  baseURL?: string
}

export function getZAIHeaders(): Record<string, string> {
  return {
    'Accept-Language': 'en-US,en',
  }
}

export function validateZAIApiKey(apiKey?: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Z.AI API key is required')
  }

  const trimmed = apiKey.trim()

  if (!trimmed) {
    throw new Error('Z.AI API key is required')
  }

  if (/^bearer\s+/i.test(trimmed)) {
    throw new Error(
      'Z.AI API key must be the raw token (do not include the "Bearer " prefix)',
    )
  }

  if (/\s/.test(trimmed)) {
    throw new Error('Z.AI API key must not contain whitespace')
  }

  return trimmed
}

export function createZAIClient(
  apiKey: string,
  config?: ClientConfig,
): OpenAI {
  const validatedKey = validateZAIApiKey(apiKey)

  return new OpenAI({
    apiKey: validatedKey,
    baseURL: config?.baseURL ?? 'https://api.z.ai/api/paas/v4',
    defaultHeaders: getZAIHeaders(),
  })
}
