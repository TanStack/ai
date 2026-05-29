import { describe, expectTypeOf, it } from 'vitest'
import type {
  RunFinishedEvent,
  UsageCostDetails,
  UsageTotals,
} from '../src/types'
import type {
  FinishInfo,
  UsageInfo,
} from '../src/activities/chat/middleware/types'

// Locks the additive cost contract: the optional `cost`/`costDetails` fields
// must be present on every public usage surface so middleware and event
// consumers can read provider-reported cost without casts.
describe('usage cost type surface', () => {
  it('UsageTotals exposes optional cost and a typed UsageCostDetails', () => {
    expectTypeOf<UsageTotals['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageTotals['costDetails']>().toEqualTypeOf<
      UsageCostDetails | undefined
    >()
  })

  it('UsageCostDetails enumerates the known breakdown fields', () => {
    expectTypeOf<
      UsageCostDetails['upstreamInferenceCost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      UsageCostDetails['upstreamInferencePromptCost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      UsageCostDetails['upstreamInferenceCompletionsCost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      UsageCostDetails['upstreamInferenceInputCost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      UsageCostDetails['upstreamInferenceOutputCost']
    >().toEqualTypeOf<number | undefined>()
  })

  it('RunFinishedEvent.usage carries cost/costDetails', () => {
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['cost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['costDetails']
    >().toEqualTypeOf<UsageCostDetails | undefined>()
  })

  it('UsageInfo (onUsage) carries cost/costDetails', () => {
    expectTypeOf<UsageInfo['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageInfo['costDetails']>().toEqualTypeOf<
      UsageCostDetails | undefined
    >()
  })

  it('FinishInfo.usage (onFinish) carries cost/costDetails', () => {
    expectTypeOf<
      NonNullable<FinishInfo['usage']>['cost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      NonNullable<FinishInfo['usage']>['costDetails']
    >().toEqualTypeOf<UsageCostDetails | undefined>()
  })
})
