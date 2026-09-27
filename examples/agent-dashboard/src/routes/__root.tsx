import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getQueryClient } from '@/lib/query'
import { hydrateRoster } from '@/lib/session-controller'
import { DemoControlsPanel } from '@/components/demo-controls'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Agent Dashboard' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

/** Seed the team roster from the server once, so teams survive a reload. */
function RosterHydrator() {
  useEffect(() => {
    void hydrateRoster()
  }, [])
  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={getQueryClient()}>
          <RosterHydrator />
          <div className="min-h-screen">
            <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
              <Link to="/" className="text-sm font-semibold tracking-tight">
                🛰️ Agent Dashboard
              </Link>
              <nav className="flex gap-3 text-xs text-white/50">
                <Link to="/" className="hover:text-white [&.active]:text-white">
                  Teams
                </Link>
                <Link
                  to="/chat"
                  className="hover:text-white [&.active]:text-white"
                >
                  Meta-chat
                </Link>
                <Link
                  to="/history"
                  className="hover:text-white [&.active]:text-white"
                >
                  History
                </Link>
                <Link
                  to="/spend"
                  className="hover:text-white [&.active]:text-white"
                >
                  Spend
                </Link>
                <Link
                  to="/config"
                  className="hover:text-white [&.active]:text-white"
                >
                  Config
                </Link>
              </nav>
            </header>
            <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
          </div>
          {/* Inside the provider so the demo-controls plugin (portaled but still
              in this React subtree) gets the QueryClient its panels use. */}
          <TanStackDevtools
            config={{
              position: 'bottom-left',
              // Open on load only under E2E so specs can reach the demo controls;
              // real users open it themselves.
              defaultOpen: import.meta.env.VITE_E2E === '1',
            }}
            plugins={[
              {
                id: 'demo-controls',
                name: 'Demo Controls',
                // Land on this tab first when the panel is opened.
                defaultOpen: true,
                render: <DemoControlsPanel />,
              },
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
            eventBusConfig={{ connectToServerBus: false }}
          />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
