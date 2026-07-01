import { useEffect, useState } from 'react'
import { AiDevtoolsPanel } from '@tanstack/react-ai-devtools/production'
import { ClientEventBus } from '@tanstack/devtools-event-bus/client'
import type { ReactNode } from 'react'

// In production apps the <TanStackDevtools> host starts a ClientEventBus,
// which is what relays aiEventClient.emit() through the window event bus
// into aiEventClient.on() listeners. The E2E harness mounts the AI devtools
// panel directly (bypassing that host so we don't depend on
// NODE_ENV=development gating), so we start a bus ourselves once per page.
const busSingletonKey = Symbol.for('tanstack.ai.devtools.e2e.clientEventBus')

function ensureEventBus(): void {
  if (typeof window === 'undefined') return
  const slot = globalThis as typeof globalThis & {
    [busSingletonKey]?: ClientEventBus
  }
  if (slot[busSingletonKey]) return
  const bus = new ClientEventBus()
  bus.start()
  slot[busSingletonKey] = bus
}

if (typeof window !== 'undefined') {
  ensureEventBus()
}

export function DevtoolsHarness({
  children,
  initialOpen = false,
}: {
  children: ReactNode
  initialOpen?: boolean
}) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [hasOpened, setHasOpened] = useState(initialOpen)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const openDevtools = () => {
    setHasOpened(true)
    setIsOpen(true)
  }

  return (
    <div
      data-testid="devtools-harness"
      className="grid min-h-[calc(100vh-58px)] grid-cols-1 gap-0 bg-gray-950 text-gray-100 lg:grid-cols-[minmax(360px,0.78fr)_minmax(520px,1.22fr)]"
    >
      <section className="min-h-[420px] overflow-auto border-b border-gray-800 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/70 px-4 py-3">
          {isHydrated ? (
            <span data-testid="devtools-hydrated" className="sr-only">
              hydrated
            </span>
          ) : null}
          <button
            type="button"
            data-testid="open-devtools"
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            onClick={openDevtools}
            disabled={!isHydrated || isOpen}
          >
            Open Devtools
          </button>
          <button
            type="button"
            data-testid="close-devtools"
            className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-200 disabled:opacity-60"
            onClick={() => setIsOpen(false)}
            disabled={!isHydrated || !isOpen}
          >
            Close Devtools
          </button>
        </div>
        <div className="p-4">{children}</div>
      </section>
      <aside
        data-testid="devtools-panel-host"
        className="min-h-[620px] bg-gray-950"
        hidden={!isOpen}
      >
        {hasOpened ? <AiDevtoolsPanel /> : null}
      </aside>
    </div>
  )
}
