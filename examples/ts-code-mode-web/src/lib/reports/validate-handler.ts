export interface ValidationResult {
  valid: boolean
  error?: string
  strippedCode?: string
}

export async function validateHandler(
  handlerCode: string,
  _bindingTypeDefinitions: string,
  allowedBindings: Set<string>,
): Promise<ValidationResult> {
  const validationError = validateBindingUsage(handlerCode, allowedBindings)
  if (validationError) {
    return { valid: false, error: validationError }
  }

  // Basic syntax validation - check for common issues
  // Full TypeScript validation would require esbuild, but it has issues
  // in Vite's SSR environment. The code will be validated again at runtime
  // in the isolate which will catch any actual errors.
  const syntaxChecks = [
    { pattern: /^\s*$/, error: 'Handler code cannot be empty' },
    {
      pattern: /import\s+/,
      error: 'import statements are not allowed in handlers',
    },
    {
      pattern: /export\s+/,
      error: 'export statements are not allowed in handlers',
    },
  ]

  for (const check of syntaxChecks) {
    if (check.pattern.test(handlerCode)) {
      return { valid: false, error: check.error }
    }
  }

  // Return the handler code as-is (no TypeScript stripping needed for runtime)
  return { valid: true, strippedCode: handlerCode }
}

function validateBindingUsage(
  handlerCode: string,
  allowedBindings: Set<string>,
): string | null {
  const matches = handlerCode.match(/\bexternal_[A-Za-z0-9_]+\b/g) || []
  const unknown = matches.filter((name) => !allowedBindings.has(name))
  if (unknown.length === 0) return null

  const unique = Array.from(new Set(unknown))
  return `Unknown bindings used: ${unique.join(', ')}`
}
