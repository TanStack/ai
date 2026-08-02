import { transform } from 'sucrase'

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
 * Uses sucrase's pure-JavaScript `transform`, which strips the TypeScript
 * syntax that LLM-generated snippets use in practice:
 * - Type annotations (: string, : number, etc.)
 * - Generic types (Array<T>, Record<K, V>, etc.)
 * - Interface and type declarations
 * - Type assertions
 * - Enums (converted to JavaScript objects)
 *
 * Unlike esbuild, sucrase has no native binary and pulls in no Node-only
 * built-ins on its `transform` path, so this module is safe to bundle for
 * browsers and edge runtimes (Cloudflare Workers/Pages etc.).
 *
 * Limitations vs esbuild: sucrase is a type-stripper, not a down-leveler.
 * `disableESTransforms` leaves modern ECMAScript syntax untouched (the sandbox
 * engines are modern), and sucrase does NOT compile a few exotic constructs:
 * - TypeScript value `namespace`/`module` blocks are DROPPED (not emitted as an
 *   IIFE), so referencing the namespace at runtime throws `ReferenceError`.
 * - Decorators and the `accessor` keyword pass through un-lowered, so the
 *   sandbox sees invalid syntax.
 * - Post-ES2022 syntax (`using` declarations, RegExp `/v`·`/d` flags) is passed
 *   through; it runs on modern V8/Node sandboxes but may fail on older engines
 *   (e.g. QuickJS).
 * If you need any of these, supply a heavier (Node-only) transpiler via the
 * `transpile` option on `createCodeModeTool`.
 *
 * The code is wrapped in an async function before transformation to allow
 * top-level `return` and `await` statements, then unwrapped after.
 *
 * Note on errors: sucrase reports syntax errors with a position relative to the
 * *wrapped* code (offset by the one-line wrapper prefix), so any line numbers
 * surfaced downstream (e.g. `CodeModeToolResult.error.line`) are approximate.
 *
 * @param code - TypeScript or JavaScript code
 * @returns Plain JavaScript code with all type syntax removed
 * @throws Error if sucrase fails (e.g., syntax error) or wrapper extraction fails
 */
// sucrase's transform is synchronous, but we keep the published Promise-returning
// signature so existing `await stripTypeScript(...)` callers (and a custom async
// `transpile` hook) stay source-compatible across this swap.
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
