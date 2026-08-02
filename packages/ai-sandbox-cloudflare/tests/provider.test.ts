/**
 * Verifies the provider uses the deterministic id `ensure()` supplies (so a
 * preview reconnect addresses the same DO the agent edits) and falls back to a
 * random id only when none is given. `getSandbox` is mocked — no Workers runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSandbox = vi.fn()

vi.mock('@cloudflare/sandbox', () => ({
  getSandbox: (...args: Array<unknown>) => getSandbox(...args),
}))

const { cloudflareSandbox } = await import('../src/provider')

function stubSandbox() {
  return {
    setEnvVars: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
  }
}

describe('cloudflareSandbox provider — deterministic id', () => {
  beforeEach(() => {
    getSandbox.mockReset()
  })

  it('uses input.id as the sandbox id when provided', async () => {
    getSandbox.mockReturnValue(stubSandbox())
    const provider = cloudflareSandbox({ binding: {} as never })

    const handle = await provider.create({ id: 'deterministic-key' })

    expect(getSandbox).toHaveBeenCalledWith(
      {},
      'deterministic-key',
      expect.anything(),
    )
    expect(handle.id).toBe('deterministic-key')
  })

  it('falls back to a random id when no id is supplied', async () => {
    getSandbox.mockReturnValue(stubSandbox())
    const provider = cloudflareSandbox({ binding: {} as never })

    const handle = await provider.create({})

    expect(handle.id).not.toBe('')
    expect(getSandbox).toHaveBeenCalledWith({}, handle.id, expect.anything())
  })
})
