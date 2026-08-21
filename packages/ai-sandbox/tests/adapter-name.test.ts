import { describe, expect, it } from 'vitest'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { makeFakeProvider, makeMiddlewareCtx } from './fakes'
import type { FakeProvider } from './fakes'
import type { SandboxCreateInput } from '../src/contracts'

/** Wrap `provider.create` and record every input it receives. */
function captureCreate(provider: FakeProvider) {
  const seen: Array<SandboxCreateInput> = []
  const original = provider.create.bind(provider)
  provider.create = (input) => {
    seen.push(input)
    return original(input)
  }
  return seen
}

describe('optional adapterName', () => {
  it('ensure copies adapterName onto provider.create', async () => {
    const provider = makeFakeProvider()
    const seen = captureCreate(provider)
    const def = defineSandbox({ id: 'repo-with-name', provider })
    await def.ensure({
      threadId: 't-with-name',
      runId: 'r1',
      adapterName: 'grok-build',
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.adapterName).toBe('grok-build')
  })

  it('ensure still works when adapterName is omitted', async () => {
    const provider = makeFakeProvider()
    const seen = captureCreate(provider)
    const def = defineSandbox({ id: 'repo-omit', provider })
    await def.ensure({ threadId: 't-omit', runId: 'r1' })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.adapterName).toBeUndefined()
  })

  it('withSandbox sets adapterName from ctx.provider', async () => {
    const provider = makeFakeProvider()
    const seen = captureCreate(provider)
    const def = defineSandbox({
      id: 'repo-mw',
      provider,
      fileEvents: false,
    })
    const mw = withSandbox(def)
    const ctx = makeMiddlewareCtx({ threadId: 't-mw', runId: 'r1' })
    ctx.provider = 'grok-build'
    await mw.setup!(ctx)
    expect(seen[0]?.adapterName).toBe('grok-build')
  })
})
