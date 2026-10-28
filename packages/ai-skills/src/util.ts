/**
 * Reject a resource/script path that escapes its skill root. Pure string check
 * (edge-safe, no `node:path`): no absolute paths, no `..` segments, no
 * backslashes. Enforced here so both the resource tool and `skillDirectory`
 * share one guard and the conformance suite can pin it.
 */
export function assertSafeResourcePath(path: string): void {
  const normalized = path.replace(/\\/g, '/')
  const bad =
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').some((seg) => seg === '..' || seg === '~')
  if (bad) {
    throw new Error(`unsafe resource path: "${path}"`)
  }
}

/** Small, edge-safe (no `node:crypto`) stable string hash for `revision()`. */
export function stableHash(input: string): string {
  // ponytail: FNV-1a; collisions don't matter here — revision only needs to
  // change when content changes, not be cryptographically unique.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
