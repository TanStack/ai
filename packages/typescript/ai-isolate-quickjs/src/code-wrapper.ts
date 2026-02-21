/**
 * Wrap user code in an async IIFE to support top-level await
 *
 * The code is wrapped so that:
 * 1. Top-level await works
 * 2. Return values are captured and serialized
 * 3. Errors propagate correctly
 */
export function wrapCode(code: string): string {
  return `
(async function() {
  try {
    const __userResult = await (async function() {
${code}
    })();
    return JSON.stringify(__userResult);
  } catch (__error) {
    throw __error;
  }
})()
`
}
