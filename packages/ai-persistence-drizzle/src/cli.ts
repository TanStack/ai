#!/usr/bin/env node
import { runDrizzleMigrationsCli } from './migration-cli'

try {
  await runDrizzleMigrationsCli(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
