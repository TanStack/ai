import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { QueryClientProvider } from '@tanstack/react-query'
import appCss from '../styles.css?url'
import queryClient from '../queryClient'
import HeroSection from '@/components/HeroSection'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack AI Search',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,

  notFoundComponent: () => <h1>Not Found</h1>,
})

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="min-h-screen bg-linear-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 flex flex-col">
          <QueryClientProvider client={queryClient}>
            <HeroSection />
            <Outlet />
          </QueryClientProvider>
        </div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'TanStack Router Devtools Panel',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
