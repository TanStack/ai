import { describe, it, expect } from 'vitest'
import { ComputeRegistry, defaultComputeRegistry } from '../src/index'

describe('Compute Registry (§5.3)', () => {
  it('executes billSplit compute function deterministically without model floating point issues', () => {
    const inputs = {
      subtotal: 100,
      tipPercent: 20,
      splitCount: 4,
    }

    const result = defaultComputeRegistry.execute('billSplit', inputs, {})
    expect(result).toEqual({
      subtotal: 100,
      tipPercent: 20,
      splitCount: 4,
      tipAmount: 20,
      total: 120,
      perPerson: 30,
    })
  })

  it('handles billSplit with odd guest counts and decimal tips', () => {
    const inputs = {
      subtotal: 97.43,
      tipPercent: 18,
      splitCount: 3,
    }

    const result = defaultComputeRegistry.execute('billSplit', inputs, {})
    expect(result.tipAmount).toBe(17.54)
    expect(result.total).toBe(114.97)
    expect(result.perPerson).toBe(38.32)
  })

  it('allows registering and executing custom compute functions', () => {
    const registry = new ComputeRegistry()
    registry.register('currencyConvert', (inputs) => {
      const amount = Number(inputs.amount ?? 0)
      const rate = Number(inputs.rate ?? 1.1)
      return Math.round(amount * rate * 100) / 100
    })

    const result = registry.execute('currencyConvert', { amount: 50, rate: 1.08 }, {})
    expect(result).toBe(54)
  })
})
