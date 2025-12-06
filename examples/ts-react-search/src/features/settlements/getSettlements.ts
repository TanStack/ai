import { createServerFn } from '@tanstack/react-start'
import { SETTLEMENT_CURRENCY_MAP } from './constants'
import { SETTLEMENTS } from './data'

const TOTAL_COUNT = SETTLEMENTS.length

type SettlementCurrencyKey = keyof typeof SETTLEMENT_CURRENCY_MAP

function getSettlementCurrencyValue(key: string) {
  if (key in SETTLEMENT_CURRENCY_MAP) {
    return SETTLEMENT_CURRENCY_MAP[key as SettlementCurrencyKey]
  }

  return null
}

const getSettlements = createServerFn({
  method: 'GET',
})
  .inputValidator((data: { search: Record<string, string> }) => data)
  .handler(({ data: { search } }) => {
    const data = {
      totalCount: TOTAL_COUNT,
      settlements: SETTLEMENTS,
    }

    if (!search.currency && !search.from && !search.to) return data

    const filteredSettlements = SETTLEMENTS.filter((settlement) => {
      if (
        search.currency &&
        settlement.currency !== getSettlementCurrencyValue(search.currency)
      ) {
        return false
      }

      if (search.from && new Date(settlement.from) < new Date(search.from)) {
        return false
      }

      if (search.to && new Date(settlement.to) > new Date(search.to)) {
        return false
      }

      return true
    })

    return {
      ...data,
      settlements: filteredSettlements,
    }
  })

export default getSettlements
