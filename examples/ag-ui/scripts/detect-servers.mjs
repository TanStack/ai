import {
  detectServers,
  logDetectionSummary,
  outputPath,
  writeServersJson,
} from './servers.mjs'

const { servers } = writeServersJson()
logDetectionSummary(detectServers())
console.log(`[ag-ui] wrote ${outputPath}`)
