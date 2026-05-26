import { transform } from 'esbuild'

// Unique markers for wrapping/unwrapping code
const WRAPPER_START = '___TANSTACK_WRAPPER_START___'
const WRAPPER_END = '___TANSTACK_WRAPPER_END___'

/**
 * Strip TypeScript syntax from code, converting it to plain JavaScript.
 *
 * This is a safety net to ensure that even if an LLM generates TypeScript
 * code with type annotations, it will be converted to valid JavaScript
 * before being sent to the sandbox for execution.
 *
 * Uses esbuild's transform API which is extremely fast and handles all
 * TypeScript syntax including:
 * - Type annotations (: string, : number, etc.)
 * - Generic types (Array<T>, Record<K, V>, etc.)
 * - Interface and type declarations
 * - Type assertions
 * - Enums (converted to JavaScript objects)
 *
 * The code is wrapped in an async function before transformation to allow
 * top-level `return` and `await` statements, then unwrapped after.
 *
 * @param code - TypeScript or JavaScript code
 * @returns Plain JavaScript code with all type syntax removed
 * @throws Error if esbuild fails (e.g., syntax error) or wrapper extraction fails
 */
export async function stripTypeScript(code: string): Promise<string> {
  // Wrap the code in an async function to allow top-level return/await
  // This is necessary because esbuild's ESM format doesn't allow top-level returns
  const wrappedCode = `async function ${WRAPPER_START}() {\n${code}\n}; ${WRAPPER_END}`

  const result = await transform(wrappedCode, {
    loader: 'ts',
    // Don't minify - keep the code readable for debugging
    minify: false,
    // Don't use keepNames as it adds __name() helper calls that aren't available in the sandbox
    keepNames: false,
    // Target modern JavaScript (ES2022 has top-level await)
    target: 'es2022',
  })

  // Extract the code from inside the wrapper function
  const transformed = result.code

  // Find the function declaration start
  const functionStart = transformed.indexOf(`async function ${WRAPPER_START}()`)
  if (functionStart === -1) {
    throw new Error(
      '[stripTypeScript] Could not find wrapper function start in transformed output',
    )
  }

  // Find the opening brace of the function
  const openBrace = transformed.indexOf('{', functionStart)
  if (openBrace === -1) {
    throw new Error(
      '[stripTypeScript] Could not find opening brace in transformed output',
    )
  }

  // Find the end marker (regardless of formatting)
  const endMarkerIndex = transformed.indexOf(WRAPPER_END)
  if (endMarkerIndex === -1) {
    throw new Error(
      '[stripTypeScript] Could not find end marker in transformed output',
    )
  }

  // Find the closing brace of the function (last } before the end marker)
  // We need to find the } that matches the function opening
  const codeBeforeEndMarker = transformed.substring(
    openBrace + 1,
    endMarkerIndex,
  )

  // Find the last } before the end marker, accounting for the semicolon
  // The code will be: ...function body...}; WRAPPER_END or ...};\nWRAPPER_END
  const closingBraceIndex = codeBeforeEndMarker.lastIndexOf('}')

  if (closingBraceIndex === -1) {
    throw new Error(
      '[stripTypeScript] Could not find closing brace in transformed output',
    )
  }

  // Extract the function body (between { and })
  const functionBody = codeBeforeEndMarker
    .substring(0, closingBraceIndex)
    .trim()

  return functionBody
}
