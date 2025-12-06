'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SETTLEMENT_CURRENCY_MAP } from './constants'
import type { SettlementsSearch } from './types'
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

type SettlementsFiltersProps = {
  search: SettlementsSearch
}

function SettlementsFilters({ search }: SettlementsFiltersProps) {
  const navigate = useNavigate()

  const [pendingCurrency, setPendingCurrency] = useState<string>(
    search.currency || 'ALL',
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    navigate({
      to: '/settlements',
      search: {
        currency: pendingCurrency === 'ALL' ? undefined : pendingCurrency,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      },
    })
  }

  function handleClear() {
    setPendingCurrency('ALL')
    setPendingFrom(undefined)
    setPendingTo(undefined)
    navigate({ to: '/settlements' })
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] px-6"
      onSubmit={handleSubmit}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="currency">Currency</Label>
        <Select
          name="currency"
          value={pendingCurrency || ''}
          onValueChange={setPendingCurrency}
        >
          <SelectTrigger id="currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {Object.entries(SETTLEMENT_CURRENCY_MAP).map(
              ([currencyKey, currencyLabel]) => (
                <SelectItem key={currencyKey} value={currencyKey}>
                  {currencyLabel}
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

export default SettlementsFilters
