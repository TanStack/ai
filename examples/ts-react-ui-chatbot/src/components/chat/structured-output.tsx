import type { PartProps } from '@tanstack/ai-react-ui'
import type { chatOptions } from '@/chat/options'

export function StructuredOutputPart({
  part,
}: PartProps<typeof chatOptions, 'structuredOutput'>) {
  const data = part.data
  if (!data)
    return <p className="text-muted-foreground text-xs">Drafting itinerary…</p>
  return (
    <article className="rounded-xl border bg-card/80 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary">
        Itinerary
      </p>
      <h3 className="mt-1 text-lg">{data.title}</h3>
      <p className="mt-1 text-muted-foreground text-sm">{data.summary}</p>
      <ol className="mt-3 space-y-2">
        {data.days.map((day) => (
          <li key={day.label}>
            <p className="text-sm font-medium">{day.label}</p>
            <p className="text-muted-foreground text-sm">{day.plan}</p>
          </li>
        ))}
      </ol>
    </article>
  )
}
