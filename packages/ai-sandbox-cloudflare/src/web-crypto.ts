/**
 * Constant-time check of an `Authorization: Bearer <token>` header against the
 * expected token. A length mismatch returns false early (token length is not
 * secret); the equal-length comparison is timing-safe.
 */
export function timingSafeBearerEqualWeb(
  header: string | undefined,
  token: string,
): boolean {
  if (header === undefined) return false
  const a = new TextEncoder().encode(header)
  const b = new TextEncoder().encode(`Bearer ${token}`)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]
    const bi = b[i]
    if (ai !== undefined && bi !== undefined) {
      diff |= ai ^ bi
      continue
    }
    return false
  }
  return diff === 0
}
