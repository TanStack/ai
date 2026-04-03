import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack AI E2E Tests - Guitar Store' },
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
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-orange-500/20 bg-gray-900/80 px-4 py-3">
          <h1 className="text-lg font-bold text-orange-400">
            Guitar Store E2E
          </h1>
        </header>
        <main className="flex-1">{children}</main>
        <Scripts />
      </body>
    </html>
  )
}
