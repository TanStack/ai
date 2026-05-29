import { describe, expectTypeOf, it } from 'vitest'
import type { RunFinishedEvent, UsageTotals } from '../src/types'
import type {
  FinishInfo,
  UsageInfo,
} from '../src/activities/chat/middleware/types'

// Locks the additive cost contract: the optional `cost`/`costDetails` fields
// must be present on every public usage surface so middleware and event
// consumers can read provider-reported cost without casts.
describe('usage cost type surface', () => {
  it('UsageTotals exposes optional cost and costDetails', () => {
    expectTypeOf<UsageTotals['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageTotals['costDetails']>().toEqualTypeOf<
      Record<string, number | null | undefined> | undefined
    >()
  })

  it('RunFinishedEvent.usage carries cost/costDetails', () => {
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['cost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      NonNullable<RunFinishedEvent['usage']>['costDetails']
    >().toEqualTypeOf<Record<string, number | null | undefined> | undefined>()
  })

  it('UsageInfo (onUsage) carries cost/costDetails', () => {
    expectTypeOf<UsageInfo['cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<UsageInfo['costDetails']>().toEqualTypeOf<
      Record<string, number | null | undefined> | undefined
    >()
  })

  it('FinishInfo.usage (onFinish) carries cost/costDetails', () => {
    expectTypeOf<
      NonNullable<FinishInfo['usage']>['cost']
    >().toEqualTypeOf<number | undefined>()
    expectTypeOf<
      NonNullable<FinishInfo['usage']>['costDetails']
    >().toEqualTypeOf<Record<string, number | null | undefined> | undefined>()
  })
})
