import { describe, it, expect } from 'vitest'
import {
  ComputeRegistry,
  defaultComputeRegistry,
  describeComputeForPrompt,
} from '../src/index'

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

  it('computes a fixed-rate loan payment via amortization (and input aliases)', () => {
    // $300k, 6% APR, 30yr -> ~$1798.65/mo
    const result = defaultComputeRegistry.execute(
      'loanPayment',
      { loanAmount: 300000, annualInterestRate: 6, termYears: 30 },
      {},
    )
    expect(result.monthlyPayment).toBeCloseTo(1798.65, 1)
    expect(result.months).toBe(360)
    expect(result.totalInterest).toBeGreaterThan(300000)

    // aliases: principal/rate/term resolve to the same canonical inputs
    const aliased = defaultComputeRegistry.execute(
      'mortgage',
      { principal: 300000, rate: 6, term: 30 },
      {},
    )
    expect(aliased.monthlyPayment).toBeCloseTo(1798.65, 1)
  })

  it('handles a 0% loan as simple division', () => {
    const result = defaultComputeRegistry.execute(
      'loanPayment',
      { loanAmount: 1200, annualInterestRate: 0, termYears: 1 },
      {},
    )
    expect(result.monthlyPayment).toBe(100)
    expect(result.totalInterest).toBe(0)
  })

  it('applies a percentage to a value', () => {
    const result = defaultComputeRegistry.execute('percentOf', { value: 80, percent: 8.25 }, {})
    expect(result.amount).toBe(6.6)
    expect(result.total).toBe(86.6)
  })

  it('describes the compute catalog for model prompting with real function names', () => {
    const catalog = describeComputeForPrompt()
    expect(catalog).toContain('billSplit')
    expect(catalog).toContain('loanPayment')
    expect(catalog).toContain('percentOf')
    // every described function must be resolvable in the registry
    for (const fn of defaultComputeRegistry.describe()) {
      expect(defaultComputeRegistry.has(fn.name)).toBe(true)
    }
  })
})
