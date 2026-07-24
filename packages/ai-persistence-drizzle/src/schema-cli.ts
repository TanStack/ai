import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { drizzleSchemaFilename, drizzleSchemaSources } from './schema-source'
import type { DrizzleSchemaDialect } from './schema-source'

export interface SchemaCliOutput {
  writeStdout: (value: string) => void
}

export class SchemaCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaCliError'
  }
}

const usage = `Usage: tanstack-ai-drizzle-schema (--out <directory> | --stdout) [--dialect <sqlite|pg>] [--force]

Emits the TanStack AI Drizzle schema module so **your** project owns it.

This package does not ship SQL migrations. After emitting:

  1. Add the file to your drizzle-kit schema paths
  2. Run drizzle-kit generate / migrate in your app
  3. Pass the schema to drizzlePersistence(db, { provider, schema })

Options:
  --out <directory>    Write ${drizzleSchemaFilename} into the directory.
  --stdout             Print the schema module.
  --dialect <dialect>  Schema dialect: sqlite (default) or pg.
  --force              Replace a divergent file when copying.
  --help               Show this help.
`

interface ParsedArguments {
  dialect: DrizzleSchemaDialect
  force: boolean
  help: boolean
  outDirectory?: string
  stdout: boolean
}

function parseDialect(value: string | undefined): DrizzleSchemaDialect {
  if (value === 'sqlite' || value === 'pg') return value
  throw new SchemaCliError(
    `--dialect must be "sqlite" or "pg"; received: ${value ?? ''}`,
  )
}

function parseArguments(args: ReadonlyArray<string>): ParsedArguments {
  let dialect: DrizzleSchemaDialect | undefined
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
    } else if (argument === '--dialect') {
      if (dialect !== undefined) {
        throw new SchemaCliError('--dialect may only be provided once.')
      }
      dialect = parseDialect(args[index + 1])
      index++
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

  return { dialect: dialect ?? 'sqlite', force, help, outDirectory, stdout }
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

/** Execute the schema emit CLI. Exported for deterministic CLI tests. */
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
  const source = drizzleSchemaSources[parsed.dialect]
  if (parsed.stdout) {
    if (parsed.force) {
      throw new SchemaCliError('--force can only be used with --out.')
    }
    output.writeStdout(`${source.trimEnd()}\n`)
    return
  }

  const outDirectory = parsed.outDirectory
  if (!outDirectory) {
    throw new SchemaCliError('--out requires a directory.')
  }
  await mkdir(outDirectory, { recursive: true })
  const destination = join(outDirectory, drizzleSchemaFilename)
  const existing = await readExistingFile(destination)
  if (existing === source) return
  if (existing !== undefined && !parsed.force) {
    throw new SchemaCliError(
      `Refusing to overwrite divergent schema file: ${destination}. Re-run with --force to replace it.`,
    )
  }
  await writeFile(destination, source, 'utf8')
}
