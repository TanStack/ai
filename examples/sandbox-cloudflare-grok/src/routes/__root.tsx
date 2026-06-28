import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

const NotFound = () => (
  <div className="flex h-screen items-center justify-center bg-gray-900 text-gray-300">
    <h1>404 — Page Not Found</h1>
  </div>
)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack AI — Cloudflare Sandbox (Grok Build)' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-gray-900">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
