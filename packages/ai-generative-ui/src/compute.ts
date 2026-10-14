/**
 * Open Generative UI Specification (Draft 0.1)
 * Host-side deterministic compute registry (§5.3).
 */

export type ComputeFunction = (
  inputs: Record<string, any>,
  state: Record<string, any>,
) => Record<string, any> | any

export class ComputeRegistry {
  private readonly functions = new Map<string, ComputeFunction>()

  constructor() {
    this.registerDefaults()
  }

  register(name: string, fn: ComputeFunction): this {
    this.functions.set(name, fn)
    return this
  }

  has(name: string): boolean {
    return this.functions.has(name)
  }

  get(name: string): ComputeFunction | undefined {
    return this.functions.get(name)
  }

  list(): Array<string> {
    return Array.from(this.functions.keys())
  }

  execute(name: string, inputs: Record<string, any>, state: Record<string, any>): any {
    const fn = this.functions.get(name)
    if (!fn) {
      console.warn(`[GenerativeUI] Compute function "${name}" not found in host registry`)
      return undefined
    }
    return fn(inputs, state)
  }

  private registerDefaults() {
    // U4: Bill Splitter
    this.register('billSplit', (inputs) => {
      const subtotal = Number(inputs.subtotal ?? 0)
      const tipPercent = Number(inputs.tipPercent ?? 18)
      const splitCount = Math.max(1, Math.round(Number(inputs.splitCount ?? 1)))

      const tipAmount = Math.round(subtotal * (tipPercent / 100) * 100) / 100
      const total = Math.round((subtotal + tipAmount) * 100) / 100
      const perPerson = Math.round((total / splitCount) * 100) / 100

      return {
        subtotal,
        tipPercent,
        splitCount,
        tipAmount,
        total,
        perPerson,
      }
    })

    // U4: Savings Growth
    this.register('savingsGrowth', (inputs) => {
      const principal = Number(inputs.principal ?? 1000)
      const annualRate = Number(inputs.annualRate ?? 5) / 100
      const years = Number(inputs.years ?? 5)
      const monthlyContribution = Number(inputs.monthlyContribution ?? 100)

      const monthlyRate = annualRate / 12
      const months = years * 12

      let futureValue = principal
      let totalContributions = principal

      for (let m = 0; m < months; m++) {
        futureValue = (futureValue + monthlyContribution) * (1 + monthlyRate)
        totalContributions += monthlyContribution
      }

      futureValue = Math.round(futureValue * 100) / 100
      const totalInterest = Math.round((futureValue - totalContributions) * 100) / 100

      return {
        futureValue,
        totalContributions,
        totalInterest,
      }
    })

    // U7: Sum / Aggregates
    this.register('sum', (inputs) => {
      const items = Array.isArray(inputs.items) ? inputs.items : []
      return items.reduce((acc, curr) => acc + (Number(curr) || 0), 0)
    })
  }
}

export const defaultComputeRegistry = new ComputeRegistry()
