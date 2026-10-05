/** Remove lone UTF-16 surrogates. Keep valid pairs unchanged. */
export function sanitizeUnicode(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  )
}

/** Sanitize decoded argument strings. Keep original JSON bytes when nothing changes. */
export function sanitizeJsonArguments(argumentsJson: string): string {
  try {
    JSON.parse(argumentsJson)
    return argumentsJson.replace(/"(?:\\.|[^"\\])*"/g, (token) => {
      const decoded: unknown = JSON.parse(token)
      if (typeof decoded !== 'string') return token
      const clean = sanitizeUnicode(decoded)
      return clean === decoded ? token : JSON.stringify(clean)
    })
  } catch {
    return argumentsJson
  }
}
