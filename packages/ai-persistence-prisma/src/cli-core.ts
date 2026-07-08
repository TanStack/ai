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

const prismaMigrationCliConfig: MigrationCliConfig<CliDialect> = {
  commandName: 'tanstack-ai-persistence-prisma',
  defaultDialect: 'sqlite',
  allowedDialects: ['sqlite', 'postgres'],
  defaultName: 'tanstack_ai_persistence',
  defaultOut: ({ cwd, timestamp, name }) =>
    join(cwd, 'prisma', 'migrations', `${timestamp}_${name}`, 'migration.sql'),
}

export { formatMigrationSql }

export function runMigrationCli(
  argv: Array<string>,
  options?: CliOptions,
): Promise<CliResult> {
  return runSharedMigrationCli(argv, prismaMigrationCliConfig, options)
}
