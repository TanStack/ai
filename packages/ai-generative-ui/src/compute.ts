/**
 * Open Generative UI Specification (Draft 0.1)
 * Host-side deterministic compute registry (§5.3).
 *
 * The host — never the model — owns arithmetic. The model binds inputs to a
 * named function; the host evaluates it deterministically. This keeps numeric
 * results correct and auditable regardless of which model composed the graph.
 */

export type ComputeFunction = (
  inputs: Record<string, any>,
  state: Record<string, any>,
) => Record<string, any> | any

export interface ComputeDescriptor {
  /** Human/model-readable summary of what the function returns. */
  description: string
  /** Accepted input keys (first listed is canonical; the rest are aliases). */
  inputs: Array<string>
  /** Shape of the output: a scalar number, or an object with these keys. */
  output: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Resolve the first defined value among a set of alias keys. */
function pick(inputs: Record<string, any>, keys: Array<string>, fallback = 0): number {
  for (const k of keys) {
    if (inputs[k] !== undefined && inputs[k] !== null && inputs[k] !== '') {
      return Number(inputs[k])
    }
  }
  return fallback
}

export class ComputeRegistry {
  private readonly functions = new Map<string, ComputeFunction>()
  private readonly descriptors = new Map<string, ComputeDescriptor>()

  constructor() {
    this.registerDefaults()
  }

  register(name: string, fn: ComputeFunction, descriptor?: ComputeDescriptor): this {
    this.functions.set(name, fn)
    if (descriptor) this.descriptors.set(name, descriptor)
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

  /** Catalog of registered functions, for prompting a model (§7.3). */
  describe(): Array<{ name: string } & ComputeDescriptor> {
    return Array.from(this.descriptors.entries()).map(([name, d]) => ({ name, ...d }))
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
    // U4: Bill splitter — subtotal + tip, divided by guests.
    this.register(
      'billSplit',
      (inputs) => {
        const subtotal = pick(inputs, ['subtotal', 'amount', 'bill'])
        const tipPercent = pick(inputs, ['tipPercent', 'tip', 'gratuity'], 18)
        const splitCount = Math.max(1, Math.round(pick(inputs, ['splitCount', 'guests', 'people'], 1)))
        const tipAmount = round2(subtotal * (tipPercent / 100))
        const total = round2(subtotal + tipAmount)
        return {
          subtotal,
          tipPercent,
          splitCount,
          tipAmount,
          total,
          perPerson: round2(total / splitCount),
        }
      },
      {
        description: 'Split a bill: applies a tip percentage to a subtotal and divides across guests.',
        inputs: ['subtotal', 'tipPercent', 'splitCount'],
        output: '{ subtotal, tipPercent, splitCount, tipAmount, total, perPerson }',
      },
    )

    // U4: Fixed-rate loan / mortgage — standard amortized monthly payment.
    const loanPaymentFn: ComputeFunction = (inputs) => {
      const principal = pick(inputs, ['loanAmount', 'principal', 'amount'])
      const annualRatePct = pick(inputs, ['annualInterestRate', 'interestRate', 'rate', 'apr'])
      const termYears = pick(inputs, ['termYears', 'years', 'term', 'loanTerm'], 30)
      const monthlyRate = annualRatePct / 100 / 12
      const months = Math.max(1, Math.round(termYears * 12))
      const monthlyPayment =
        monthlyRate === 0
          ? principal / months
          : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      const totalPaid = monthlyPayment * months
      return {
        monthlyPayment: round2(monthlyPayment),
        totalPaid: round2(totalPaid),
        totalInterest: round2(totalPaid - principal),
        months,
      }
    }
    const loanPaymentDesc: ComputeDescriptor = {
      description: 'Monthly payment for a fixed-rate amortized loan or mortgage.',
      inputs: ['loanAmount', 'annualInterestRate', 'termYears'],
      output: '{ monthlyPayment, totalPaid, totalInterest, months }',
    }
    this.register('loanPayment', loanPaymentFn, loanPaymentDesc)

    // U4: Balloon loan — finance part of the principal over the term and pay a
    // lump sum (the balloon) at a later year. Monthly payment amortizes
    // (loanAmount - balloonAmount); the balloon is due at balloonYear.
    const balloonLoanFn: ComputeFunction = (inputs) => {
      const principal = pick(inputs, ['loanAmount', 'principal', 'amount'])
      const annualRatePct = pick(inputs, ['annualInterestRate', 'interestRate', 'rate', 'apr'])
      const termYears = pick(inputs, ['termYears', 'years', 'term', 'loanTerm'], 30)
      const balloonAmount = pick(inputs, ['balloonAmount', 'balloon', 'balloonPayment'])
      const balloonYear = pick(inputs, ['balloonYear', 'balloonDueYear', 'dueYear'], termYears)
      const financed = Math.max(0, principal - balloonAmount)
      const monthlyRate = annualRatePct / 100 / 12
      const months = Math.max(1, Math.round(termYears * 12))
      const monthlyPayment =
        monthlyRate === 0
          ? financed / months
          : (financed * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      const paymentMonths = Math.max(1, Math.round(Math.min(balloonYear, termYears) * 12))
      const totalMonthly = monthlyPayment * paymentMonths
      const totalPaid = totalMonthly + balloonAmount
      return {
        monthlyPayment: round2(monthlyPayment),
        balloonDue: round2(balloonAmount),
        balloonYear: Math.round(balloonYear),
        totalPaid: round2(totalPaid),
        totalInterest: round2(totalPaid - principal),
      }
    }
    const balloonLoanDesc: ComputeDescriptor = {
      description:
        'Balloon loan/mortgage: monthly payment amortizes (loanAmount - balloonAmount) over the term, with the balloonAmount due as a lump sum at balloonYear.',
      inputs: ['loanAmount', 'annualInterestRate', 'termYears', 'balloonAmount', 'balloonYear'],
      output: '{ monthlyPayment, balloonDue, balloonYear, totalPaid, totalInterest }',
    }
    this.register('balloonLoan', balloonLoanFn, balloonLoanDesc)
    this.register('balloonMortgage', balloonLoanFn, balloonLoanDesc)

    // U4: Savings growth — compound interest with monthly contributions.
    this.register(
      'savingsGrowth',
      (inputs) => {
        const principal = pick(inputs, ['principal', 'initial', 'startingBalance'], 1000)
        const annualRate = pick(inputs, ['annualRate', 'rate', 'apy'], 5) / 100
        const years = pick(inputs, ['years', 'term'], 5)
        const monthlyContribution = pick(inputs, ['monthlyContribution', 'contribution', 'monthly'], 100)
        const monthlyRate = annualRate / 12
        const months = Math.max(0, Math.round(years * 12))
        let futureValue = principal
        let totalContributions = principal
        for (let m = 0; m < months; m++) {
          futureValue = (futureValue + monthlyContribution) * (1 + monthlyRate)
          totalContributions += monthlyContribution
        }
        return {
          futureValue: round2(futureValue),
          totalContributions: round2(totalContributions),
          totalInterest: round2(futureValue - totalContributions),
        }
      },
      {
        description: 'Future value of savings with compound interest and recurring monthly contributions.',
        inputs: ['principal', 'annualRate', 'years', 'monthlyContribution'],
        output: '{ futureValue, totalContributions, totalInterest }',
      },
    )

    // Generic: percentage of a value (tax, discount, commission, etc.).
    this.register(
      'percentOf',
      (inputs) => {
        const value = pick(inputs, ['value', 'amount', 'base'])
        const percent = pick(inputs, ['percent', 'rate', 'pct'])
        const amount = round2(value * (percent / 100))
        return { amount, total: round2(value + amount), base: value, percent }
      },
      {
        description: 'Apply a percentage to a value — tax, discount, tip, or commission.',
        inputs: ['value', 'percent'],
        output: '{ amount, total, base, percent }',
      },
    )

    // U7: Sum / aggregate a list of numbers.
    this.register(
      'sum',
      (inputs) => {
        const items = Array.isArray(inputs.items) ? inputs.items : []
        const total = items.reduce((acc, curr) => acc + (Number(curr) || 0), 0)
        return round2(total)
      },
      {
        description: 'Sum an array of numbers. Pass the array as the "items" input.',
        inputs: ['items'],
        output: 'number (the total)',
      },
    )

    // Aliases so a model can use the obvious name and still hit a real function.
    this.register('mortgage', loanPaymentFn, loanPaymentDesc)
    this.register('calculateMortgage', loanPaymentFn, loanPaymentDesc)
  }
}

export const defaultComputeRegistry = new ComputeRegistry()

/**
 * Render the registry's catalog as a prompt fragment, so a live model binds
 * inputs to functions that actually exist on the host (§7.3). Without this the
 * model invents plausible names (e.g. "calculateMortgage") that never execute.
 */
export function describeComputeForPrompt(
  registry: ComputeRegistry = defaultComputeRegistry,
): string {
  const lines = registry.describe().map((f) => {
    return `- "${f.name}"(${f.inputs.join(', ')}) -> ${f.output}: ${f.description}`
  })
  return lines.join('\n')
}
