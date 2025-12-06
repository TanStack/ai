import { createServerFn } from '@tanstack/react-start'
import { DISPUTE_REASON_MAP, DISPUTE_STATUS_MAP } from './constants'
import { DISPUTES } from './data'

const TOTAL_COUNT = DISPUTES.length

type DisputeStatusKey = keyof typeof DISPUTE_STATUS_MAP

function getDisputeStatusValue(key: string) {
  if (key in DISPUTE_STATUS_MAP) {
    return DISPUTE_STATUS_MAP[key as DisputeStatusKey]
  }

  return null
}

type DisputeReasonKey = keyof typeof DISPUTE_REASON_MAP

function getDisputeReasonValue(key: string) {
  if (key in DISPUTE_REASON_MAP) {
    return DISPUTE_REASON_MAP[key as DisputeReasonKey]
  }

  return null
}

const getDisputes = createServerFn({
  method: 'GET',
})
  .inputValidator((data: { search: Record<string, string> }) => data)
  .handler(({ data: { search } }) => {
    const data = {
      totalCount: TOTAL_COUNT,
      disputes: DISPUTES,
    }

    if (!search.status && !search.reason && !search.from && !search.to)
      return data

    const filteredDisputes = DISPUTES.filter((dispute) => {
      if (
        search.status &&
        dispute.status !== getDisputeStatusValue(search.status)
      ) {
        return false
      }

      if (
        search.reason &&
        dispute.reason !== getDisputeReasonValue(search.reason)
      ) {
        return false
      }

      if (search.from && new Date(dispute.from) < new Date(search.from)) {
        return false
      }

      if (search.to && new Date(dispute.to) > new Date(search.to)) {
        return false
      }

      return true
    })

    return {
      ...data,
      disputes: filteredDisputes,
    }
  })

export default getDisputes
