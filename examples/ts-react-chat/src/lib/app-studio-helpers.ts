export function previewUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)"']+/)
  return match ? match[0] : null
}

export function previewUrlFrom(output: unknown): string | null {
  let value: unknown = output
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output)
    } catch {
      return /^https?:\/\//.test(output) ? output : null
    }
  }
  if (value !== null && typeof value === 'object' && 'url' in value) {
    const url = value.url
    return typeof url === 'string' ? url : null
  }
  return null
}

export const DEFAULT_COMPARE_PROMPT =
  'Keep the same product. Change only the visual direction.'

export function comparePrompt(userText: string): string {
  const trimmed = userText.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_COMPARE_PROMPT
}

export function variantPrompt(userText: string, variant: 'A' | 'B'): string {
  const prompt = comparePrompt(userText)
  if (variant === 'A') {
    return `${prompt}\n\nThis is variant A. Keep the same product. Use a bold, high-contrast, compact visual direction.`
  }
  return `${prompt}\n\nThis is variant B. Keep the same product. Use a soft, spacious, calm visual direction.`
}

export function threadIdsFromForkBody(body: unknown): Array<string> {
  if (body === null || typeof body !== 'object') return []
  const forks = Reflect.get(body, 'forks')
  if (!Array.isArray(forks)) return []
  return forks.flatMap((fork) => {
    if (fork === null || typeof fork !== 'object') return []
    const id = Reflect.get(fork, 'threadId')
    return typeof id === 'string' && id.length > 0 ? [id] : []
  })
}

export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const error = body.error
    if (typeof error === 'string' && error.length > 0) return error
  }
  return fallback
}
