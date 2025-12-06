'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ORDER_STATUS_MAP, PAYMENT_METHOD_MAP } from './constants'
import type { OrdersSearch } from './types'
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

type OrdersFiltersProps = {
  search: OrdersSearch
}

function OrdersFilters({ search }: OrdersFiltersProps) {
  const navigate = useNavigate()

  const statusId = 'status'
  const paymentMethodId = 'paymentMethod'

  const [pendingStatus, setPendingStatus] = useState<string>(
    search.status || 'ALL',
  )
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<string>(
    search.paymentMethod || 'ALL',
  )
  const [pendingFrom, setPendingFrom] = useState<string | undefined>(
    search.from,
  )
  const [pendingTo, setPendingTo] = useState<string | undefined>(search.to)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    navigate({
      to: '/orders',
      search: {
        status: pendingStatus === 'ALL' ? undefined : pendingStatus,
        paymentMethod:
          pendingPaymentMethod === 'ALL' ? undefined : pendingPaymentMethod,
        from: pendingFrom === '' ? undefined : pendingFrom,
        to: pendingTo === '' ? undefined : pendingTo,
      },
    })
  }

  function handleClear() {
    setPendingStatus('ALL')
    setPendingPaymentMethod('ALL')
    setPendingFrom(undefined)
    setPendingTo(undefined)
    navigate({ to: '/orders' })
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] px-6"
      onSubmit={handleSubmit}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          name="status"
          value={pendingStatus || ''}
          onValueChange={setPendingStatus}
        >
          <SelectTrigger id={statusId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {Object.entries(ORDER_STATUS_MAP).map(
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
        <Label htmlFor={paymentMethodId}>Payment method</Label>
        <Select
          name="paymentMethod"
          value={pendingPaymentMethod || ''}
          onValueChange={setPendingPaymentMethod}
        >
          <SelectTrigger id={paymentMethodId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            {Object.entries(PAYMENT_METHOD_MAP).map(
              ([paymentMethodKey, paymentMethodLabel]) => (
                <SelectItem key={paymentMethodKey} value={paymentMethodKey}>
                  {paymentMethodLabel}
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

export default OrdersFilters
