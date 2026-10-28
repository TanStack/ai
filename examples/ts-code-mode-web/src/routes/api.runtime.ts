import { createFileRoute } from '@tanstack/react-router'

/**
 * Reports whether the *server* process is running under Bun.
 * The browser cannot see this — `typeof Bun` is only meaningful in the
 * process that creates isolate drivers — so the Isolate VM sidebar fetches
 * this endpoint to warn when "QuickJS Bun" would fall back to WASM.
 */
export const Route = createFileRoute('/api/runtime')({
  server: {
    handlers: {
      GET: async () => {
        const isBun =
          typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
        return Response.json({
          isBun,
          runtime: isBun ? 'bun' : 'node',
        })
      },
    },
  },
})
