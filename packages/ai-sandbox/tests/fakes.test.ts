import { describe, expect, it } from 'vitest'
import { createCapability } from '@tanstack/ai'
import { makeFakeHandle, makeMiddlewareCtx } from './fakes'

describe('makeMiddlewareCtx', () => {
  it('tracks provided capabilities and stores their values', () => {
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const capability = createCapability<{ value: string }>()('fake-capability')
    const value = { value: 'stored' }

    expect(ctx.capabilities.has(capability)).toBe(false)
    ctx.provide(capability, value)

    expect(ctx.capabilities.has(capability)).toBe(true)
    expect(ctx.get(capability)).toBe(value)
  })
})

describe('makeFakeHandle', () => {
  it('reports written files as files', async () => {
    const handle = makeFakeHandle('id', 'fake')
    const content = 'export {}\n'
    await handle.fs.write('/workspace/app.ts', content)
    await expect(handle.fs.lstat!('/workspace/app.ts')).resolves.toEqual({
      type: 'file',
      mode: 0o644,
      size: new TextEncoder().encode(content).byteLength,
    })
    await expect(handle.fs.lstat!('/workspace')).resolves.toEqual({
      type: 'dir',
      mode: 0o755,
    })
  })
})
