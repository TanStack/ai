import { createFileRoute } from '@tanstack/react-router'
import { InterruptLabPage } from '@/lib/interrupt-lab/InterruptLabPage'
import { interruptLabSearchFromSearch } from '@/lib/interrupt-lab/client-ui'

export const Route = createFileRoute('/durable-interrupts')({
  validateSearch: (search) => interruptLabSearchFromSearch(search, 'durable'),
  component: DurableInterruptLabRoute,
})

function DurableInterruptLabRoute() {
  const { debug, case: scenarioId = 'approval-basic' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <InterruptLabPage
      mode="durable"
      debug={debug ?? false}
      scenarioId={scenarioId}
      onScenarioChange={(nextScenarioId) => {
        void navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            case: nextScenarioId,
          }),
        })
      }}
    />
  )
}
