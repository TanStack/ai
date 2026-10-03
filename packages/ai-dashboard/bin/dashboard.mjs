#!/usr/bin/env node
// Start a dashboard: npx @tanstack/ai-dashboard [--port 8790] [--host 127.0.0.1]
import { parseArgs } from 'node:util'
import { startDashboard } from '../dist/esm/index.js'

const { values } = parseArgs({
  options: { port: { type: 'string' }, host: { type: 'string' } },
})
const dashboard = await startDashboard({
  port: Number(values.port ?? process.env.PORT ?? 8790),
  hostname: values.host ?? process.env.HOST ?? '127.0.0.1',
  ...(process.env.DASHBOARD_OWNER_TOKEN
    ? { ownerToken: process.env.DASHBOARD_OWNER_TOKEN }
    : {}),
})
console.log(`Dashboard: ${dashboard.url}`)
if (!process.env.DASHBOARD_OWNER_TOKEN) {
  console.log(`Owner token: ${dashboard.ownerToken}`)
  console.log(`Sign in: ${dashboard.url}/#token=${dashboard.ownerToken}`)
}
const stop = async () => {
  await dashboard.close()
  process.exit(0)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
