import { Command, Option } from 'commander'
import { COMMANDS, COMMON_FLAGS, toKebabFlag } from '../manifest/manifest'
import { coerceFlags } from './options'
import { dispatchCommand } from './dispatch'
import { runIntrospect } from './introspect'
import type { CommandSpec, FlagSpec } from '../manifest/types'

/** Build the full commander program from the declarative manifest. */
export function buildProgram(cliVersion: string): Command {
  const program = new Command()
  program
    .name('ts-ai')
    .description('Type-safe CLI over TanStack AI — chat, image, video, audio, speech, transcribe, summarize.')
    .version(cliVersion, '--version')
    .showHelpAfterError()

  // No command: show the animated home menu on a TTY, help otherwise.
  program.action(async () => {
    if (process.stdout.isTTY) {
      const { runHome } = await import('./interactive')
      await runHome()
    } else {
      program.outputHelp()
    }
  })

  for (const spec of COMMANDS) {
    registerGenerationCommand(program, spec)
  }

  registerIntrospect(program, cliVersion)
  registerMcp(program, cliVersion)
  registerUpdate(program)

  return program
}

function registerGenerationCommand(program: Command, spec: CommandSpec): void {
  const cmd = program.command(spec.name).description(spec.description)
  for (const alias of spec.aliases ?? []) cmd.alias(alias)

  // Positional input: a prompt for prompt-accepting commands, otherwise a
  // single optional input (e.g. transcribe's audio file path).
  cmd.argument(spec.acceptsPrompt ? '[prompt...]' : '[input]', 'Prompt / input')

  for (const flag of [...COMMON_FLAGS, ...spec.flags]) applyFlag(cmd, flag)

  cmd.action(async (positional: Array<string> | string | undefined, _opts, command: Command) => {
    const raw = coerceFlags(spec, command.opts())
    const args = Array.isArray(positional)
      ? positional
      : positional
        ? [positional]
        : []
    await dispatchCommand(spec, args, raw)
  })

  // `ts-ai video status <jobId>` — poll an existing job.
  if (spec.name === 'video') {
    const status = cmd
      .command('status <jobId>')
      .description('Check the status of a video generation job.')
    for (const flag of COMMON_FLAGS) applyFlag(status, flag)
    status.action(async (jobId: string, _opts, command: Command) => {
      // Options can land on the parent `video` command or on `status`; merge both.
      const merged = { ...(command.parent?.opts() ?? {}), ...command.opts() }
      const raw = coerceFlags(spec, merged)
      const { createRunContext } = await import('./context')
      const { runVideoStatus } = await import('./activities/video')
      const ctx = await createRunContext(raw)
      await runVideoStatus(ctx, jobId)
    })
  }
}

function registerIntrospect(program: Command, cliVersion: string): void {
  program
    .command('introspect')
    .description('Print a machine-readable manifest of the entire CLI surface as JSON.')
    .action(() => runIntrospect(cliVersion))
}

function registerMcp(program: Command, cliVersion: string): void {
  program
    .command('mcp')
    .description('Start an MCP server exposing each command as a tool (stdio).')
    .action(async () => {
      const { runMcpServer } = await import('./mcp')
      await runMcpServer(cliVersion)
    })
}

function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Update ts-ai to the latest version.')
    .action(async () => {
      const { runUpdate } = await import('./update')
      await runUpdate()
    })
}

/** Translate a manifest FlagSpec into a commander option. */
function applyFlag(cmd: Command, flag: FlagSpec): void {
  const kebab = toKebabFlag(flag.name)
  // A default-true boolean is expressed as a `--no-x` negatable flag.
  if (flag.type === 'boolean' && flag.default === true) {
    cmd.option(`--no-${kebab}`, flag.description)
    return
  }

  const long = `--${kebab}`
  const namePart = flag.short ? `-${flag.short}, ${long}` : long
  const flagStr =
    flag.type === 'boolean' ? namePart : `${namePart} <value>`

  const option = new Option(flagStr, flag.description)
  if (flag.hidden) option.hideHelp()
  if (flag.repeatable || flag.type === 'string[]') {
    option.argParser((value: string, previous: Array<string> = []) => [...previous, value])
    option.default([])
  }
  cmd.addOption(option)
}
