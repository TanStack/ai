const PREFERRED_SPLAT_KEYS = ['500k', '100k', '150k', 'full_res'] as const

export function pickSplatUrl(
  spzUrls: Record<string, string> | undefined,
): string | undefined {
  if (!spzUrls) return undefined
  for (const key of PREFERRED_SPLAT_KEYS) {
    const url = spzUrls[key]
    if (typeof url === 'string' && url.length > 0) return url
  }
  for (const url of Object.values(spzUrls)) {
    if (url.length > 0) return url
  }
  return undefined
}

/** Same-origin proxy allowlist. Marble asset URLs are signed CDN links and are not CORS-open. */
export function isAllowedMarbleSplatUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username.length > 0 || url.password.length > 0) return false
  const host = url.hostname.toLowerCase()
  return (
    host === 'worldlabs.ai' ||
    host.endsWith('.worldlabs.ai') ||
    host === 'storage.googleapis.com' ||
    host.endsWith('.storage.googleapis.com') ||
    host.endsWith('.googleusercontent.com')
  )
}

export function marbleSplatProxyPath(
  splatUrl: string,
  filename?: string,
): string {
  const params = new URLSearchParams({ url: splatUrl })
  const safe = filename ? safeDownloadName(filename) : undefined
  if (safe) params.set('filename', safe)
  return `/api/marble-splat?${params.toString()}`
}

export function safeDownloadName(name: string): string | undefined {
  return /^[A-Za-z0-9._-]{1,128}$/.test(name) ? name : undefined
}

export class MarblePlanError extends Error {
  constructor(
    message = 'This World Labs plan cannot export that file. Open the world in Marble, or upgrade the plan.',
  ) {
    super(message)
    this.name = 'MarblePlanError'
  }
}

export async function downloadMarbleAsset(
  url: string,
  filename: string,
): Promise<void> {
  const safe = safeDownloadName(filename) ?? splatFileName(url)
  const response = await fetch(marbleSplatProxyPath(url, safe))
  if (response.status === 402 || response.status === 403) {
    throw new MarblePlanError()
  }
  if (!response.ok) {
    throw new Error('Download failed')
  }
  const blob = await response.blob()
  if (blob.size === 0) {
    throw new Error('Download failed')
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = safe
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function splatFileName(splatUrl: string): string {
  try {
    const name = new URL(splatUrl).pathname.split('/').pop()
    if (name && /\.(spz|ply|splat|ksplat|sog|rad)$/i.test(name)) return name
  } catch {
    // Use the default name when the URL is opaque.
  }
  return 'world.spz'
}
