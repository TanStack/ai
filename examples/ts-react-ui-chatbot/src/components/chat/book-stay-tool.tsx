import type { InterruptProps, ToolProps } from '@tanstack/ai-react-ui'
import { Button } from '@/components/ui/button'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai/tool'
import type { chatOptions } from '@/chat/options'

export function BookStayTool({
  part,
}: ToolProps<typeof chatOptions, 'bookStay'>) {
  return (
    <Tool defaultOpen>
      <ToolHeader state={part.state} title="bookStay" />
      <ToolContent>
        {part.input ? <ToolInput input={part.input} /> : null}
        {part.output ? <ToolOutput output={part.output} /> : null}
      </ToolContent>
    </Tool>
  )
}

export function BookStayApproval({
  interrupt,
}: InterruptProps<typeof chatOptions, 'bookStay'>) {
  if (interrupt.status !== 'pending') {
    return <p className="text-muted-foreground text-xs">{interrupt.status}</p>
  }
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary">
        Approve stay
      </p>
      <p className="text-sm">Hold this room from the desk list?</p>
      <div className="flex gap-2">
        <Button
          onClick={() => interrupt.resolveInterrupt(true)}
          size="sm"
          type="button"
        >
          Approve stay
        </Button>
        <Button
          onClick={() => interrupt.resolveInterrupt(false)}
          size="sm"
          type="button"
          variant="outline"
        >
          Deny
        </Button>
      </div>
    </div>
  )
}
