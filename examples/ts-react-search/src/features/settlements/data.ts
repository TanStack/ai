import { SETTLEMENT_CURRENCY_MAP } from './constants'
import type { Settlement } from './types'

export const SETTLEMENTS: Array<Settlement> = [
  {
    id: 'set_3001',
    currency: SETTLEMENT_CURRENCY_MAP.USD,
    from: '2025-01-02T00:00:00Z',
    to: '2025-01-08T23:59:59Z',
  },
  {
    id: 'set_3002',
    currency: SETTLEMENT_CURRENCY_MAP.EUR,
    from: '2025-01-16T00:00:00Z',
    to: '2025-01-22T23:59:59Z',
  },
  {
    id: 'set_3003',
    currency: SETTLEMENT_CURRENCY_MAP.GBP,
    from: '2025-02-03T00:00:00Z',
    to: '2025-02-09T23:59:59Z',
  },
  {
    id: 'set_3004',
    currency: SETTLEMENT_CURRENCY_MAP.SEK,
    from: '2025-02-18T00:00:00Z',
    to: '2025-02-24T23:59:59Z',
  },
  {
    id: 'set_3005',
    currency: SETTLEMENT_CURRENCY_MAP.DKK,
    from: '2025-03-05T00:00:00Z',
    to: '2025-03-11T23:59:59Z',
  },
  {
    id: 'set_3006',
    currency: SETTLEMENT_CURRENCY_MAP.NOK,
    from: '2025-03-20T00:00:00Z',
    to: '2025-03-26T23:59:59Z',
  },
  {
    id: 'set_3007',
    currency: SETTLEMENT_CURRENCY_MAP.PLN,
    from: '2025-04-10T00:00:00Z',
    to: '2025-04-16T23:59:59Z',
  },
  {
    id: 'set_3008',
    currency: SETTLEMENT_CURRENCY_MAP.USD,
    from: '2025-04-25T00:00:00Z',
    to: '2025-05-01T23:59:59Z',
  },
  {
    id: 'set_3009',
    currency: SETTLEMENT_CURRENCY_MAP.EUR,
    from: '2025-05-12T00:00:00Z',
    to: '2025-05-18T23:59:59Z',
  },
  {
    id: 'set_3010',
    currency: SETTLEMENT_CURRENCY_MAP.GBP,
    from: '2025-06-01T00:00:00Z',
    to: '2025-06-07T23:59:59Z',
  },
]
