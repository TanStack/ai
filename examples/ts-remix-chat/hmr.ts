import * as http from 'node:http'

import { createFetchProxy } from 'remix/fetch-proxy'
import { createHmrReadyFetch, run } from 'remix/node-hmr'
import { createRequestListener } from 'remix/node-fetch-server'

function parsePort(value: string | undefined, fallback: number): number {
  const port = value === undefined ? fallback : Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Port must be an integer from 1 to 65535 (got ${value ?? fallback})`,
    )
  }
  return port
}

const hmrProxyPort = parsePort(process.env.PORT, 44100)
const hmrEventPort = parsePort(process.env.HMR_PORT, hmrProxyPort + 1)
const appPort = parsePort(process.env.APP_PORT, hmrEventPort + 1)

const hmrRunner = run('server.ts', {
  env: {
    ...process.env,
    PORT: String(appPort),
    HMR_PROXY_PORT: String(hmrProxyPort),
  },
  nodeArgs: ['--import', 'remix/node-tsx', '--import', 'remix/ui-hmr/node'],
  browserHmrChannel: { port: hmrEventPort },
})

const server = http.createServer(
  createRequestListener(
    createHmrReadyFetch(
      hmrRunner,
      createFetchProxy(`http://127.0.0.1:${appPort}`, {
        xForwardedHeaders: true,
      }),
    ),
  ),
)

server.listen(hmrProxyPort, '127.0.0.1')

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => hmrRunner.close().finally(() => process.exit(0)))
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
