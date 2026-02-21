import { Inbox, FileQuestion, Database, BarChart3 } from 'lucide-react'
import type { EmptyProps } from '@/lib/reports/types'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  file: FileQuestion,
  database: Database,
  chart: BarChart3,
}

export function Empty({
  title = 'No data',
  description,
  icon = 'inbox',
}: EmptyProps) {
  const IconComponent = iconMap[icon] || Inbox

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-sky-100/60 flex items-center justify-center mb-4">
        <IconComponent className="w-6 h-6 text-[var(--report-text-muted)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--report-text)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--report-text-muted)] max-w-sm">
          {description}
        </p>
      )}
    </div>
  )
}
