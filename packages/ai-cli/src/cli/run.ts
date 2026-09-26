import { CommanderError } from 'commander'
import { ExitCode, toCliError } from '../core/exit-codes'
import { emitError } from '../core/emit'
import { isMachine, resolveOutputMode } from '../core/output'
import { buildProgram } from './program'
import type { ExitCodeValue } from '../core/exit-codes'

/**
 * Parse argv and run. Returns the process exit code; never throws. All command
 * errors are funneled through CliError so the exit code and (in machine mode)
 * the structured stdout error object are consistent.
 */
export async function run(
  argv: Array<string>,
  cliVersion: string,
): Promise<ExitCodeValue> {
  const program = buildProgram(cliVersion)
  // Take control of exits so commander's own usage/help/version paths don't
  // call process.exit out from under us.
  program.exitOverride()

  try {
    await program.parseAsync(argv, { from: 'user' })
    return ExitCode.Success
  } catch (err) {
    if (err instanceof CommanderError) {
      // Help and version are successful terminal states.
      if (
        err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.help' ||
        err.code === 'commander.version'
      ) {
        return ExitCode.Success
      }
      // Everything else from commander is a usage/validation problem.
      return ExitCode.Usage
    }

    const cliError = toCliError(err)
    const mode = resolveOutputMode({
      json: argv.includes('--json'),
      stream: argv.includes('--stream'),
    })
    if (isMachine(mode)) {
      emitError(cliError)
    } else {
      // Pretty (TTY) mode: a branded red ✗ instead of a bare "error:" line.
      const red = process.stderr.isTTY ? '[38;2;244;63;94m' : ''
      const reset = process.stderr.isTTY ? '[39m' : ''
      process.stderr.write(`${red}✗${reset} ${cliError.message}\n`)
    }
    return cliError.exitCode
  }
}
