'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  DISPUTE_REASON_MAP,
  DISPUTE_STATUS_MAP,
  disputesSearchSchema,
} from './constants'
import type { FormEvent } from 'react'
import type { DisputesSearch } from './types'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { ALL_OPTION } from '@/constants'
import FilterSelect from '@/components/FilterSelect'

type DisputesFiltersProps = {
  search: DisputesSearch
}

function DisputesFilters({ search }: DisputesFiltersProps) {
  const navigate = useNavigate()

  const [pendingStatus, setPendingStatus] = useState<string>(
    search.status || ALL_OPTION,
  )
  const [pendingReason, setPendingReason] = useState<string>(
    search.reason || ALL_OPTION,
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await navigate({
      to: '/disputes',
      search: disputesSearchSchema.parse({
        status: pendingStatus === ALL_OPTION ? undefined : pendingStatus,
        reason: pendingReason === ALL_OPTION ? undefined : pendingReason,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      }),
    })
  }

  async function handleClear() {
    setPendingStatus(ALL_OPTION)
    setPendingReason(ALL_OPTION)
    setPendingFrom(undefined)
    setPendingTo(undefined)

    await navigate({ to: '/disputes', search: disputesSearchSchema.parse({}) })
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] px-6"
      onSubmit={handleSubmit}
    >
      <FilterSelect
        id="status"
        label="Status"
        value={pendingStatus}
        onChange={setPendingStatus}
        options={Object.entries(DISPUTE_STATUS_MAP)}
      />
      <FilterSelect
        id="resason"
        label="Reason"
        value={pendingReason}
        onChange={setPendingReason}
        options={Object.entries(DISPUTE_REASON_MAP)}
      />
      <DatePicker
        label="From"
        value={pendingFrom}
        onChange={setPendingFrom}
        placeholder="Select date"
      />
      <DatePicker
        label="To"
        value={pendingTo}
        onChange={setPendingTo}
        placeholder="Select date"
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end lg:self-end lg:pt-6">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </form>
  )
}

export default DisputesFilters
