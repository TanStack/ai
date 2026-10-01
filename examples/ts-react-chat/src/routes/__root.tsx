import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { aiDevtoolsPlugin } from '@tanstack/react-ai-devtools'
import Header from '../components/Header'
import appCss from '../styles.css?url'

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
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: 'https://tanstack.com/favicon-light.svg',
        media: '(prefers-color-scheme: light)',
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: 'https://tanstack.com/favicon-dark.svg',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    scripts: [
      {
        // Vite prints http://127.0.0.1:3000, but passkeys reject IP hosts.
        // Run the app on localhost. ChatGPT sign-in still redirects to
        // 127.0.0.1, and this sends that callback back here too.
        children: `if (location.hostname === '127.0.0.1') { const u = new URL(location.href); u.hostname = 'localhost'; location.replace(u) }`,
      },
    ],
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
            aiDevtoolsPlugin(),
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
