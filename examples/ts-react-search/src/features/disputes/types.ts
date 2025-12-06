import type {
  DISPUTE_REASON_MAP,
  DISPUTE_STATUS_MAP,
  disputesSearchSchema,
} from './constants'
import type z from 'zod'

type DisputeStatus =
  (typeof DISPUTE_STATUS_MAP)[keyof typeof DISPUTE_STATUS_MAP]
type DisputeReason =
  (typeof DISPUTE_REASON_MAP)[keyof typeof DISPUTE_REASON_MAP]

export type Dispute = {
  id: string
  status: DisputeStatus
  reason: DisputeReason
  from: string
  to: string
}

export type DisputesSearch = z.infer<typeof disputesSearchSchema>
