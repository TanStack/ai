import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query'
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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={getQueryClient()}>
        <div className="min-h-screen">
          <header className="border-b border-white/10 px-6 py-3">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              🛰️ Agent Dashboard
            </Link>
            <span className="ml-3 text-xs text-white/40">
              mission control for TanStack AI agents
            </span>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
        </div>
        </QueryClientProvider>
        <TanStackDevtools
          config={{ position: 'bottom-left' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
          eventBusConfig={{ connectToServerBus: false }}
        />
        <Scripts />
      </body>
    </html>
  )
}
