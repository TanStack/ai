export function generateId(prefix: string): string {
  const timestamp = Date.now()
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `${prefix}-${timestamp}-${randomPart}`
}
