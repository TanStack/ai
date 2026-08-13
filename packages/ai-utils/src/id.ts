export function generateId(prefix: string): string {
  const timestamp = Date.now()
  // Drop the "0." prefix from the base36 float (2 chars), keeping the full
  // random portion (~9+ chars of entropy). Previously used `.substring(7)`
  // which left only ~4 random chars — see the regression test in ai-fal's
  // utils.
  const randomPart = Math.random().toString(36).substring(2)
  return `${prefix}-${timestamp}-${randomPart}`
}
