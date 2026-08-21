import { describe, expectTypeOf, it } from 'vitest'
import type {
  RunFinishedEvent,
  UsageCostBreakdown,
  TokenUsage,
} from '../src/types'
import type { SpecTokenUsage } from '../src/utilities/ag-ui-usage'
import type {
  FinishInfo,
  UsageInfo,
} from '../src/activities/chat/middleware/types'

// Locks the additive cost contract: the optional `cost`/`costDetails` fields
// must be present on every public usage surface so middleware and event
// consumers can read provider-reported cost without casts. The breakdown shape
// is canonical (provider-neutral) — adapter extractors normalize their
// wire-specific keys onto these three fields.
describe('usage cost type surface', () => {
  it('TokenUsage exposes optional cost and a UsageCostBreakdown', () => {
    expectTypeOf<TokenUsage['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<TokenUsage['costDetails']>().toEqualTypeOf<
      UsageCostBreakdown | undefined
    >()
  })

  it('UsageCostBreakdown enumerates the canonical breakdown fields', () => {
    expectTypeOf<UsageCostBreakdown['upstreamCost']>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<UsageCostBreakdown['upstreamInputCost']>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<UsageCostBreakdown['upstreamOutputCost']>().toEqualTypeOf<
      number | undefined
    >()
  })

  it('RunFinishedEvent.usage is TokenUsage or spec usage[]', () => {
    expectTypeOf<NonNullable<RunFinishedEvent['usage']>>().toEqualTypeOf<
      Array<SpecTokenUsage> | TokenUsage
    >()
  })

  it('UsageInfo (onUsage) carries cost/costDetails', () => {
    expectTypeOf<UsageInfo['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageInfo['costDetails']>().toEqualTypeOf<
      UsageCostBreakdown | undefined
    >()
  })

  it('FinishInfo.usage (onFinish) carries cost/costDetails', () => {
    expectTypeOf<NonNullable<FinishInfo['usage']>['cost']>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<
      NonNullable<FinishInfo['usage']>['costDetails']
    >().toEqualTypeOf<UsageCostBreakdown | undefined>()
  })
})
