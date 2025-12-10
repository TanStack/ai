import type { Dispute } from './types'

export const DISPUTES: Array<Dispute> = [
  {
    id: 'dis_2001',
    status: 'LOST',
    reason: 'RETURN',
    from: '2025-01-10T09:00:00Z',
    to: '2025-01-15T18:00:00Z',
  },
  {
    id: 'dis_2002',
    status: 'WON',
    reason: 'INCORRECT_INVOICE',
    from: '2025-02-05T10:30:00Z',
    to: '2025-02-12T14:00:00Z',
  },
  {
    id: 'dis_2003',
    status: 'RESPONSE_REQUIRED',
    reason: 'HIGH_RISK_ORDER',
    from: '2025-03-18T08:15:00Z',
    to: '2025-03-25T17:00:00Z',
  },
  {
    id: 'dis_2004',
    status: 'UNDER_REVIEW',
    reason: 'GOODS_NOT_RECEIVED',
    from: '2025-04-12T11:00:00Z',
    to: '2025-04-18T16:30:00Z',
  },
  {
    id: 'dis_2005',
    status: 'UNDER_REVIEW',
    reason: 'UNAUTHORIZED_PURCHASE',
    from: '2025-05-08T09:45:00Z',
    to: '2025-05-15T15:00:00Z',
  },
  {
    id: 'dis_2006',
    status: 'LOST',
    reason: 'FAULTY_GOODS',
    from: '2025-06-02T13:20:00Z',
    to: '2025-06-08T10:00:00Z',
  },
  {
    id: 'dis_2007',
    status: 'RESPONSE_REQUIRED',
    reason: 'UNAUTHORIZED_PURCHASE',
    from: '2025-07-20T14:50:00Z',
    to: '2025-07-28T09:30:00Z',
  },
  {
    id: 'dis_2008',
    status: 'UNDER_REVIEW',
    reason: 'RETURN',
    from: '2025-08-14T08:00:00Z',
    to: '2025-08-22T17:30:00Z',
  },
  {
    id: 'dis_2009',
    status: 'WON',
    reason: 'GOODS_NOT_RECEIVED',
    from: '2025-09-09T10:10:00Z',
    to: '2025-09-15T16:00:00Z',
  },
  {
    id: 'dis_2010',
    status: 'UNDER_REVIEW',
    reason: 'HIGH_RISK_ORDER',
    from: '2025-10-01T15:00:00Z',
    to: '2025-10-10T11:00:00Z',
  },
]
