import { describe, expect, it } from 'vitest'
import { seal, unseal } from '../src/crypto'

describe('seal', () => {
  it('gives back the text with the same secret, and hides it at rest', async () => {
    const sealed = await seal('secret-a', '{"type":"api_key","value":"sk-123"}')
    expect(sealed).not.toContain('sk-123')
    expect(await unseal('secret-a', sealed)).toBe(
      '{"type":"api_key","value":"sk-123"}',
    )
  })

  it('makes a new ciphertext each time', async () => {
    expect(await seal('secret-a', 'same')).not.toBe(
      await seal('secret-a', 'same'),
    )
  })

  it('refuses another secret', async () => {
    const sealed = await seal('secret-a', 'value')
    await expect(unseal('secret-b', sealed)).rejects.toThrow()
  })
})
