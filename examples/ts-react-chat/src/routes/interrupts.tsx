import { createFileRoute } from '@tanstack/react-router'
import { InterruptLabPage } from '@/lib/interrupt-lab/InterruptLabPage'

export const Route = createFileRoute('/interrupts')({
  component: EphemeralInterruptLabRoute,
})

function EphemeralInterruptLabRoute() {
  return <InterruptLabPage mode="ephemeral" />
}
