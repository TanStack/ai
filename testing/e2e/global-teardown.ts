export default async function globalTeardown() {
  const mock = (globalThis as any).__aimock
  if (mock) {
    await mock.stop()
    console.log('[aimock] stopped')
  }
}
