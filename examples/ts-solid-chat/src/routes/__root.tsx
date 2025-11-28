import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/solid-router-devtools'
import { TanStackDevtools } from '@tanstack/solid-devtools'
// import { aiDevtoolsPlugin } from "@tanstack/react-ai-devtools";
import { HydrationScript } from 'solid-js/web'
import appCss from '../styles.css?url'
import Header from '../components/Header'
import type { JSXElement } from 'solid-js'

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
        title: 'TanStack Start Starter',
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
})

function RootDocument({ children }: { children: JSXElement }) {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <Header />
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            // aiDevtoolsPlugin(),
          ]}
          eventBusConfig={{
            connectToServerBus: true,
          }}
        />
        <Scripts />
      </body>
    </html>
  )
}
