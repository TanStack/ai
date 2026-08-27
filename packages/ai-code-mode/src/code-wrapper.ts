export function wrapCode(code: string): string {
  // Results must be serialized to JSON because objects can't be transferred
  // directly across the isolate boundary in isolated-vm
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
