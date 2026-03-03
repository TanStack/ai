import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
// Devtools are dynamically imported on the client to avoid server-side bundling
import { onMount, createSignal } from 'solid-js'
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
  const [Devtools, setDevtools] = createSignal<JSXElement | null>(null)

  onMount(async () => {
    try {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }] =
        await Promise.all([
          import('@tanstack/solid-devtools'),
          import('@tanstack/solid-router-devtools'),
        ])

      setDevtools(
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
        />,
      )
    } catch (e) {
      // If devtools fail to load on the client, ignore silently
      // This prevents build/SSR from failing due to dev-only exports
      // eslint-disable-next-line no-console
      console.warn('Failed to load devtools on client', e)
    }
  })

  return (
    <html lang="en">
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <Header />
        {children}
        {Devtools()}
        <Scripts />
      </body>
    </html>
  )
}
