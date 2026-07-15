import { createFileRoute } from '@tanstack/react-router'
import { InterruptLabPage } from '@/lib/interrupt-lab/InterruptLabPage'

export const Route = createFileRoute('/durable-interrupts')({
  component: DurableInterruptLabRoute,
})

function DurableInterruptLabRoute() {
  return <InterruptLabPage mode="durable" />
}
