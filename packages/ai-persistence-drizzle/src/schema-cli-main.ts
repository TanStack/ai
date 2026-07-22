#!/usr/bin/env node
import { runDrizzleSchemaCli } from './schema-cli'

try {
  await runDrizzleSchemaCli(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
