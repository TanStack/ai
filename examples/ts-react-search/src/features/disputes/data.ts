import { DISPUTE_REASON_MAP, DISPUTE_STATUS_MAP } from './constants'
import type { Dispute } from './types'

export const DISPUTES: Array<Dispute> = [
  {
    id: 'dis_2001',
    status: DISPUTE_STATUS_MAP.LOST,
    reason: DISPUTE_REASON_MAP.RETURN,
    from: '2025-01-10T09:00:00Z',
    to: '2025-01-15T18:00:00Z',
  },
  {
    id: 'dis_2002',
    status: DISPUTE_STATUS_MAP.WON,
    reason: DISPUTE_REASON_MAP.INCORRECT_INVOICE,
    from: '2025-02-05T10:30:00Z',
    to: '2025-02-12T14:00:00Z',
  },
  {
    id: 'dis_2003',
    status: DISPUTE_STATUS_MAP.RESPONSE_REQUIRED,
    reason: DISPUTE_REASON_MAP.HIGH_RISK_ORDER,
    from: '2025-03-18T08:15:00Z',
    to: '2025-03-25T17:00:00Z',
  },
  {
    id: 'dis_2004',
    status: DISPUTE_STATUS_MAP.UNDER_REVIEW,
    reason: DISPUTE_REASON_MAP.GOODS_NOT_RECEIVED,
    from: '2025-04-12T11:00:00Z',
    to: '2025-04-18T16:30:00Z',
  },
  {
    id: 'dis_2005',
    status: DISPUTE_STATUS_MAP.UNDER_REVIEW,
    reason: DISPUTE_REASON_MAP.UNAUTHORIZED_PURCHASE,
    from: '2025-05-08T09:45:00Z',
    to: '2025-05-15T15:00:00Z',
  },
  {
    id: 'dis_2006',
    status: DISPUTE_STATUS_MAP.LOST,
    reason: DISPUTE_REASON_MAP.FAULTY_GOODS,
    from: '2025-06-02T13:20:00Z',
    to: '2025-06-08T10:00:00Z',
  },
  {
    id: 'dis_2007',
    status: DISPUTE_STATUS_MAP.RESPONSE_REQUIRED,
    reason: DISPUTE_REASON_MAP.UNAUTHORIZED_PURCHASE,
    from: '2025-07-20T14:50:00Z',
    to: '2025-07-28T09:30:00Z',
  },
  {
    id: 'dis_2008',
    status: DISPUTE_STATUS_MAP.UNDER_REVIEW,
    reason: DISPUTE_REASON_MAP.RETURN,
    from: '2025-08-14T08:00:00Z',
    to: '2025-08-22T17:30:00Z',
  },
  {
    id: 'dis_2009',
    status: DISPUTE_STATUS_MAP.WON,
    reason: DISPUTE_REASON_MAP.GOODS_NOT_RECEIVED,
    from: '2025-09-09T10:10:00Z',
    to: '2025-09-15T16:00:00Z',
  },
  {
    id: 'dis_2010',
    status: DISPUTE_STATUS_MAP.UNDER_REVIEW,
    reason: DISPUTE_REASON_MAP.HIGH_RISK_ORDER,
    from: '2025-10-01T15:00:00Z',
    to: '2025-10-10T11:00:00Z',
  },
]
