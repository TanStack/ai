export default async function globalTeardown() {
  const mock = globalThis.__aimock
  if (mock) {
    await mock.stop()
    console.log('[aimock] stopped')
  }
}
