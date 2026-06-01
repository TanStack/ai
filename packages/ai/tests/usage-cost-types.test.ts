import { describe, expectTypeOf, it } from 'vitest'
import type {
  RunFinishedEvent,
  UsageCostBreakdown,
  UsageTotals,
} from '../src/types'
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
  it('UsageTotals exposes optional cost and a UsageCostBreakdown', () => {
    expectTypeOf<UsageTotals['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageTotals['costDetails']>().toEqualTypeOf<
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

  it('RunFinishedEvent.usage carries cost/costDetails', () => {
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['cost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['costDetails']
    >().toEqualTypeOf<UsageCostBreakdown | undefined>()
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
