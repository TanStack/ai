'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SectionProps } from '@/lib/reports/types'

export function Section({
  title,
  defaultOpen = true,
  collapsible = true,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!collapsible) {
    return (
      <div className="border border-sky-200/60 rounded-lg overflow-hidden bg-white/80 shadow-sm">
        <div className="px-4 py-3 bg-gradient-to-r from-sky-100/60 to-sky-50/40 border-b border-sky-200/50">
          <h3 className="font-semibold text-[var(--report-text)]">{title}</h3>
        </div>
        <div className="p-4">{children}</div>
      </div>
    )
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="border border-sky-200/60 rounded-lg overflow-hidden bg-white/80 shadow-sm">
        <Collapsible.Trigger className="w-full px-4 py-3 bg-gradient-to-r from-sky-100/60 to-sky-50/40 border-b border-sky-200/50 flex items-center gap-2 hover:from-sky-200/70 hover:to-sky-100/50 transition-all cursor-pointer">
          {open ? (
            <ChevronDown className="w-4 h-4 text-[var(--report-text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--report-text-muted)]" />
          )}
          <h3 className="font-semibold text-[var(--report-text)]">{title}</h3>
        </Collapsible.Trigger>
        <Collapsible.Content className="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden">
          <div className="p-4">{children}</div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
