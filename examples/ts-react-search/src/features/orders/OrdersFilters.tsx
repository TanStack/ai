'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ORDER_STATUS_MAP,
  PAYMENT_METHOD_MAP,
  ordersSearchSchema,
} from './constants'
import type { FormEvent } from 'react'
import type { OrdersSearch } from './types'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { ALL_OPTION } from '@/constants'
import FilterSelect from '@/components/FilterSelect'

type OrdersFiltersProps = {
  search: OrdersSearch
}

function OrdersFilters({ search }: OrdersFiltersProps) {
  const navigate = useNavigate()

  const [pendingStatus, setPendingStatus] = useState<string>(
    search.status || ALL_OPTION,
  )
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<string>(
    search.paymentMethod || ALL_OPTION,
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await navigate({
      to: '/orders',
      search: ordersSearchSchema.parse({
        status: pendingStatus === ALL_OPTION ? undefined : pendingStatus,
        paymentMethod:
          pendingPaymentMethod === ALL_OPTION
            ? undefined
            : pendingPaymentMethod,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      }),
    })
  }

  async function handleClear() {
    setPendingStatus(ALL_OPTION)
    setPendingPaymentMethod(ALL_OPTION)
    setPendingFrom(undefined)
    setPendingTo(undefined)

    await navigate({ to: '/orders', search: ordersSearchSchema.parse({}) })
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
        options={Object.entries(ORDER_STATUS_MAP)}
      />
      <FilterSelect
        id="paymentMethod"
        label="Payment method"
        value={pendingPaymentMethod}
        onChange={setPendingPaymentMethod}
        options={Object.entries(PAYMENT_METHOD_MAP)}
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

export default OrdersFilters
