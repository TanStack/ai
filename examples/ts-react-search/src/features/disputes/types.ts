import type {
  DISPUTE_REASONS,
  DISPUTE_STATUSES,
  disputeSchema,
  disputesSearchSchema,
} from './constants'
import type z from 'zod'

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number]

export type DisputeReason = (typeof DISPUTE_REASONS)[number]

export type Dispute = z.infer<typeof disputeSchema>

export type DisputesSearch = z.infer<typeof disputesSearchSchema>
