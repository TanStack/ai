import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { d1Migrations } from './migrations'

export interface MigrationCliOutput {
  writeStdout: (value: string) => void
}

export class MigrationCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationCliError'
  }
}

const usage = `Usage: tanstack-ai-cloudflare-migrations (--out <directory> | --stdout) [--force]

Options:
  --out <directory>  Copy the ordered Cloudflare D1 migration files.
  --stdout           Print the ordered migration SQL.
  --force            Replace divergent files when copying.
  --help             Show this help.
`

interface ParsedArguments {
  force: boolean
  help: boolean
  outDirectory?: string
  stdout: boolean
}

function parseArguments(args: ReadonlyArray<string>): ParsedArguments {
  let force = false
  let help = false
  let outDirectory: string | undefined
  let stdout = false

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--force') {
      force = true
    } else if (argument === '--help' || argument === '-h') {
      help = true
    } else if (argument === '--stdout') {
      stdout = true
    } else if (argument === '--out') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new MigrationCliError('--out requires a directory.')
      }
      if (outDirectory !== undefined) {
        throw new MigrationCliError('--out may only be provided once.')
      }
      outDirectory = value
      index++
    } else {
      throw new MigrationCliError(`Unknown argument: ${argument ?? ''}`)
    }
  }

  return { force, help, outDirectory, stdout }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return undefined
    throw error
  }
}

/** Execute the D1 migration asset CLI. Exported for deterministic CLI tests. */
export async function runCloudflareMigrationsCli(
  args: ReadonlyArray<string>,
  output: MigrationCliOutput = {
    writeStdout(value) {
      process.stdout.write(value)
    },
  },
): Promise<void> {
  const parsed = parseArguments(args)
  if (parsed.help) {
    output.writeStdout(usage)
    return
  }

  const outputCount =
    Number(parsed.stdout) + Number(parsed.outDirectory != null)
  if (outputCount !== 1) {
    throw new MigrationCliError(
      'Provide exactly one output mode: --out <directory> or --stdout.',
    )
  }
  if (parsed.stdout) {
    if (parsed.force) {
      throw new MigrationCliError('--force can only be used with --out.')
    }
    output.writeStdout(
      `${d1Migrations.map((migration) => migration.sql.trimEnd()).join('\n\n')}\n`,
    )
    return
  }

  const outDirectory = parsed.outDirectory
  if (!outDirectory) {
    throw new MigrationCliError('--out requires a directory.')
  }
  await mkdir(outDirectory, { recursive: true })
  for (const migration of d1Migrations) {
    const destination = join(outDirectory, migration.filename)
    const existing = await readExistingFile(destination)
    if (existing === migration.sql) continue
    if (existing !== undefined && !parsed.force) {
      throw new MigrationCliError(
        `Refusing to overwrite divergent migration file: ${destination}. Re-run with --force to replace it.`,
      )
    }
    await writeFile(destination, migration.sql, 'utf8')
  }
}
