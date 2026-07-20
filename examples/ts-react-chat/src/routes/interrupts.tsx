import { createFileRoute } from '@tanstack/react-router'
import { InterruptLabPage } from '@/lib/interrupt-lab/InterruptLabPage'
import { interruptLabSearchFromSearch } from '@/lib/interrupt-lab/client-ui'

export const Route = createFileRoute('/interrupts')({
  validateSearch: (search) => interruptLabSearchFromSearch(search, 'ephemeral'),
  component: EphemeralInterruptLabRoute,
})

function EphemeralInterruptLabRoute() {
  const { debug, case: scenarioId = 'approval-basic' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <InterruptLabPage
      mode="ephemeral"
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
