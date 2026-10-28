export function maskKey(key: string): string {
  if (key.length <= 4) return '••'
  return key.slice(-4)
}

/**
 * Replace each of `secrets` in `text` with `[redacted]`: the raw value, its
 * JSON-escaped form, and its URL-encoded form. A secret shorter than 6
 * characters is left alone, so a tiny value does not redact common words.
 */
export function scrubSecrets(
  text: string,
  secrets: ReadonlyArray<string>,
): string {
  const forms = new Set<string>()
  for (const secret of secrets) {
    if (secret.length < 6) continue
    forms.add(secret)
    forms.add(JSON.stringify(secret).slice(1, -1))
    forms.add(encodeURIComponent(secret))
  }
  // The longest first, so a secret inside another does not leave a part.
  let scrubbed = text
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    scrubbed = scrubbed.split(form).join('[redacted]')
  }
  return scrubbed
}
