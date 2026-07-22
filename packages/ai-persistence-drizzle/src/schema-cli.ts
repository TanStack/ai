import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { drizzleSchemaFilename, drizzleSchemaSource } from './schema-source'

export interface SchemaCliOutput {
  writeStdout: (value: string) => void
}

export class SchemaCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaCliError'
  }
}

const usage = `Usage: tanstack-ai-drizzle-schema (--out <directory> | --stdout) [--force]

Emits the TanStack AI Drizzle schema module so your project owns it: add the
file to your drizzle-kit schema paths and pass it to drizzlePersistence(db, { schema }).

Options:
  --out <directory>  Copy the schema module into the directory.
  --stdout           Print the schema module.
  --force            Replace a divergent file when copying.
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
        throw new SchemaCliError('--out requires a directory.')
      }
      if (outDirectory !== undefined) {
        throw new SchemaCliError('--out may only be provided once.')
      }
      outDirectory = value
      index++
    } else {
      throw new SchemaCliError(`Unknown argument: ${argument ?? ''}`)
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

/** Execute the schema asset CLI. Exported for deterministic CLI tests. */
export async function runDrizzleSchemaCli(
  args: ReadonlyArray<string>,
  output: SchemaCliOutput = {
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
    throw new SchemaCliError(
      'Provide exactly one output mode: --out <directory> or --stdout.',
    )
  }
  if (parsed.stdout) {
    if (parsed.force) {
      throw new SchemaCliError('--force can only be used with --out.')
    }
    output.writeStdout(`${drizzleSchemaSource.trimEnd()}\n`)
    return
  }

  const outDirectory = parsed.outDirectory
  if (!outDirectory) {
    throw new SchemaCliError('--out requires a directory.')
  }
  await mkdir(outDirectory, { recursive: true })
  const destination = join(outDirectory, drizzleSchemaFilename)
  const existing = await readExistingFile(destination)
  if (existing === drizzleSchemaSource) return
  if (existing !== undefined && !parsed.force) {
    throw new SchemaCliError(
      `Refusing to overwrite divergent schema file: ${destination}. Re-run with --force to replace it.`,
    )
  }
  await writeFile(destination, drizzleSchemaSource, 'utf8')
}
