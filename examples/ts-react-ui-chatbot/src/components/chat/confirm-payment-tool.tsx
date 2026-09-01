import type { InterruptProps, ToolProps } from '@tanstack/ai-react/ui'
import { Button } from '@/components/ui/button'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai/tool'
import type { chatOptions } from '@/chat/options'

export function ConfirmPaymentTool({
  part,
  interrupt,
}: ToolProps<typeof chatOptions, 'confirmPayment'>) {
  return (
    <Tool defaultOpen>
      <ToolHeader state={part.state} title="confirmPayment" />
      <ToolContent>
        {part.input ? <ToolInput input={part.input} /> : null}
        {interrupt ? <ConfirmPaymentApproval interrupt={interrupt} /> : null}
        {part.output ? <ToolOutput output={part.output} /> : null}
      </ToolContent>
    </Tool>
  )
}

function ConfirmPaymentApproval({
  interrupt,
}: InterruptProps<typeof chatOptions, 'confirmPayment'>) {
  if (interrupt.status !== 'pending') {
    return <p className="text-muted-foreground text-xs">{interrupt.status}</p>
  }
  return (
    <div className="space-y-2 rounded-md border bg-secondary/40 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary">
        Approve charge
      </p>
      <p className="text-sm">Hold this payment on the card on file?</p>
      <div className="flex gap-2">
        <Button
          onClick={() => interrupt.resolveInterrupt(true)}
          size="sm"
          type="button"
        >
          Charge card
        </Button>
        <Button
          onClick={() => interrupt.resolveInterrupt(false)}
          size="sm"
          type="button"
          variant="outline"
        >
          Decline
        </Button>
      </div>
    </div>
  )
}
