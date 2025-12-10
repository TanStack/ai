'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SETTLEMENT_CURRENCY_MAP, settlementsSearchSchema } from './constants'
import type { FormEvent } from 'react'
import type { SettlementsSearch } from './types'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { ALL_OPTION } from '@/constants'
import FilterSelect from '@/components/FilterSelect'

type SettlementsFiltersProps = {
  search: SettlementsSearch
}

function SettlementsFilters({ search }: SettlementsFiltersProps) {
  const navigate = useNavigate()

  const [pendingCurrency, setPendingCurrency] = useState<string>(
    search.currency || ALL_OPTION,
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await navigate({
      to: '/settlements',
      search: settlementsSearchSchema.parse({
        currency: pendingCurrency === ALL_OPTION ? undefined : pendingCurrency,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      }),
    })
  }

  async function handleClear() {
    setPendingCurrency(ALL_OPTION)
    setPendingFrom(undefined)
    setPendingTo(undefined)

    await navigate({
      to: '/settlements',
      search: settlementsSearchSchema.parse({}),
    })
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] px-6"
      onSubmit={handleSubmit}
    >
      <FilterSelect
        id="currency"
        label="Currency"
        value={pendingCurrency}
        onChange={setPendingCurrency}
        options={Object.entries(SETTLEMENT_CURRENCY_MAP)}
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

export default SettlementsFilters
