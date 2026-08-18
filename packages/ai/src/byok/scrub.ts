export function maskKey(key: string): string {
  if (key.length <= 4) return '••'
  return key.slice(-4)
}

export function scrubSecrets(
  input: string,
  secrets: ReadonlyArray<string>,
): string {
  let next = input
  for (const secret of secrets) {
    if (secret.length === 0) continue
    next = next.split(secret).join('[redacted]')
  }
  return next
}
