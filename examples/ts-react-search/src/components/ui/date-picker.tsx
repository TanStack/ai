'use client'

import { useId } from 'react'
import { CalendarIcon } from 'lucide-react'

import { enGB } from 'react-day-picker/locale'
import cn from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import formatDate from '@/utils/formatDate'

interface DatePickerProps {
  label: string
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  className,
}: DatePickerProps) {
  const id = useId()

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className="group w-full justify-between border-input bg-background px-3 font-normal outline-offset-0 outline-none hover:bg-background focus-visible:outline-[3px]"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? formatDate(value) : placeholder}
            </span>
            <CalendarIcon
              size={16}
              className="shrink-0 text-muted-foreground/80 transition-colors group-hover:text-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            mode="single"
            selected={value ? safeParse(value) : undefined}
            locale={enGB}
            onSelect={(date) => onChange(date ? formatIso(date) : '')}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function safeParse(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function formatIso(date: Date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  ).toISOString()
}
