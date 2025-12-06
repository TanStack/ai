'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DISPUTE_REASON_MAP, DISPUTE_STATUS_MAP } from './constants'
import type { DisputesSearch } from './types'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DisputesFiltersProps = {
  search: DisputesSearch
}

function DisputesFilters({ search }: DisputesFiltersProps) {
  const navigate = useNavigate()

  const [pendingStatus, setPendingStatus] = useState<string>(
    search.status || 'ALL',
  )
  const [pendingReason, setPendingReason] = useState<string>(
    search.reason || 'ALL',
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    navigate({
      to: '/disputes',
      search: {
        status: pendingStatus === 'ALL' ? undefined : pendingStatus,
        reason: pendingReason === 'ALL' ? undefined : pendingReason,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      },
    })
  }

  function handleClear() {
    setPendingStatus('ALL')
    setPendingReason('ALL')
    setPendingFrom(undefined)
    setPendingTo(undefined)
    navigate({ to: '/disputes' })
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] px-6"
      onSubmit={handleSubmit}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select
          name="status"
          value={pendingStatus || ''}
          onValueChange={setPendingStatus}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {Object.entries(DISPUTE_STATUS_MAP).map(
              ([statusKey, statusLabel]) => (
                <SelectItem key={statusKey} value={statusKey}>
                  {statusLabel}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="reason">Reason</Label>
        <Select
          name="reason"
          value={pendingReason || ''}
          onValueChange={setPendingReason}
        >
          <SelectTrigger id="reason">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {Object.entries(DISPUTE_REASON_MAP).map(
              ([reasonKey, reasonLabel]) => (
                <SelectItem key={reasonKey} value={reasonKey}>
                  {reasonLabel}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
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
