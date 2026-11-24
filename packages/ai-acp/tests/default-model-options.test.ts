import { describe, expect, it } from 'vitest'
import { acpCompatible, acpCompatibleText } from '../src/index'

describe('acpCompatible defaultModelOptions', () => {
  it('acpCompatible stores the defaults on the adapter, not in the harness config', () => {
    const pi = acpCompatible({
      name: 'pi',
      command: ({ model }) => `pi --acp -m ${model}`,
      defaultModelOptions: { authMethodId: 'pi-api-key', cwd: '/repo' },
    })
    const adapter = pi('pi-pro')

    expect(adapter.defaultModelOptions).toEqual({
      authMethodId: 'pi-api-key',
      cwd: '/repo',
    })
    expect('defaultModelOptions' in adapter['harness']).toBe(false)
    expect(adapter['harness'].name).toBe('pi')
  })

  it('acpCompatibleText stores the defaults on the adapter', () => {
    const adapter = acpCompatibleText('pi-fast', {
      name: 'pi',
      command: ({ model }) => `pi --acp -m ${model}`,
      defaultModelOptions: { permissionMode: 'default' },
    })

    expect(adapter.defaultModelOptions).toEqual({ permissionMode: 'default' })
    expect('defaultModelOptions' in adapter['harness']).toBe(false)
  })
})
