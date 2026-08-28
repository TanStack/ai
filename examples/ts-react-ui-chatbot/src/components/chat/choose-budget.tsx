import type { InterruptProps } from '@tanstack/ai-react/ui'
import { Button } from '@/components/ui/button'
import type { chatOptions } from '@/chat/options'

export function ChooseBudget({
  interrupt,
}: InterruptProps<typeof chatOptions, 'chooseBudget'>) {
  const options = interrupt.payload?.options ?? []
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary">
        Budget
      </p>
      <p className="mt-1 text-sm">
        How should we spend in {interrupt.payload?.city ?? 'this city'}?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((budget) => (
          <Button
            key={budget}
            onClick={() => interrupt.resolveInterrupt({ budget })}
            size="sm"
            type="button"
            variant="outline"
          >
            {budget}
          </Button>
        ))}
      </div>
    </div>
  )
}
