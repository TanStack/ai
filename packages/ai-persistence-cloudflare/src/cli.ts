#!/usr/bin/env node
import { runCloudflareMigrationsCli } from './migration-cli'

await runCloudflareMigrationsCli(process.argv.slice(2))
