import { serve } from '@hono/node-server'
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { app } from './app'

loadDotenv({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
})

const port = Number.parseInt(process.env.PORT ?? '8787', 10)

serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port,
})

console.log(
  `TanStack AI React Native example server listening on http://0.0.0.0:${port}`,
)
