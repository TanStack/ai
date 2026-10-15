import { describe, expect, it } from 'vitest'
import { definePlugin } from '../src'
import { mockAdapter } from './helpers'

describe('definePlugin', () => {
  it('refuses a setup() contribution at the top level', () => {
    const { adapter } = mockAdapter([])
    expect(() =>
      // @ts-expect-error `adapter` is returned from `setup()`
      definePlugin({ name: 'acme/model', adapter: () => adapter }),
    ).toThrow(
      'definePlugin "acme/model": `adapter` is not a plugin option. Return it from `setup()` instead.',
    )
  })

  it('keeps an extra key as the plugin API', () => {
    const plugin = definePlugin({
      name: 'acme/api',
      diff: (from: string) => `diff ${from}`,
    })
    expect(plugin.diff('a')).toBe('diff a')
  })

  it('keeps every known option', () => {
    const plugin = definePlugin({
      name: 'acme/ok',
      lifetime: 'turn',
      requires: [],
      provides: [],
      optionalRequires: [],
      needs: {},
      setup: () => ({ prompts: ['hi'] }),
    })
    expect(plugin.name).toBe('acme/ok')
    expect(plugin.lifetime).toBe('turn')
  })
})
