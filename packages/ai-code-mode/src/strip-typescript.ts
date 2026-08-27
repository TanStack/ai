import { transform } from 'sucrase'

// Unique markers for wrapping/unwrapping code
const WRAPPER_START = '___TANSTACK_WRAPPER_START___'
const WRAPPER_END = '___TANSTACK_WRAPPER_END___'

// eslint-disable-next-line @typescript-eslint/require-await
export async function stripTypeScript(code: string): Promise<string> {
  // Wrap the code in an async function to allow top-level return/await.
  // This is necessary because top-level `return` is invalid outside a function.
  const wrappedCode = `async function ${WRAPPER_START}() {\n${code}\n}; ${WRAPPER_END}`

  const result = transform(wrappedCode, {
    // Only strip/lower TypeScript-specific syntax...
    transforms: ['typescript'],
    // ...and leave modern ECMAScript syntax untouched for the sandbox engines.
    disableESTransforms: true,
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
