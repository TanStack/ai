import { join } from 'node:path'
import {
  formatMigrationSql,
  runMigrationCli as runSharedMigrationCli,
} from '@tanstack/ai-persistence-sql/cli-core'
import type {
  CliOptions,
  CliResult,
  MigrationCliConfig,
} from '@tanstack/ai-persistence-sql/cli-core'

export type CliDialect = 'sqlite' | 'postgres'
export type { CliOptions, CliResult }

const drizzleMigrationCliConfig: MigrationCliConfig<CliDialect> = {
  commandName: 'tanstack-ai-persistence-drizzle',
  defaultDialect: 'sqlite',
  allowedDialects: ['sqlite', 'postgres'],
  defaultName: 'tanstack_ai_persistence',
  defaultOut: ({ cwd, timestamp, name }) =>
    join(cwd, 'drizzle', `${timestamp}_${name}.sql`),
}

export { formatMigrationSql }

export function runMigrationCli(
  argv: Array<string>,
  options?: CliOptions,
): Promise<CliResult> {
  return runSharedMigrationCli(argv, drizzleMigrationCliConfig, options)
}
