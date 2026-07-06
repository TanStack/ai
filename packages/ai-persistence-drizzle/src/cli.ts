import { runMigrationCli } from './cli-core'
import type { CliOptions, CliResult } from './cli-core'

export function runCli(
  argv: Array<string>,
  options?: CliOptions,
): Promise<CliResult> {
  return runMigrationCli(argv, options)
}
