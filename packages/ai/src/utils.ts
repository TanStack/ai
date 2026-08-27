export function detectImageMimeType(
  base64Data: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined {
  // Get first few bytes (base64 encoded)
  const prefix = base64Data.substring(0, 20)

  // JPEG: starts with /9j/ (FFD8FF in base64)
  if (prefix.startsWith('/9j/')) {
    return 'image/jpeg'
  }
  // PNG: starts with iVBORw0KGgo (89504E47 in base64)
  if (prefix.startsWith('iVBORw0KGgo')) {
    return 'image/png'
  }
  // GIF: starts with R0lGOD (474946 in base64)
  if (prefix.startsWith('R0lGOD')) {
    return 'image/gif'
  }
  // WebP: starts with UklGR (52494646 in base64, followed by WEBP)
  if (prefix.startsWith('UklGR')) {
    return 'image/webp'
  }

  return undefined
}
