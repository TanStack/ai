export default async function globalTeardown() {
  const mock = (globalThis as any).__llmock
  if (mock) {
    await mock.stop()
    console.log('[global-teardown] llmock stopped')
  }
}
