import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { ddl } from '@tanstack/ai-persistence-sql'

export type CliDialect = 'sqlite' | 'postgres'

export interface CliOptions {
  cwd?: string
  now?: Date
  writeStdout?: (value: string) => void
}

export type CliResult =
  | { kind: 'file'; path: string }
  | { kind: 'stdout'; sql: string }
  | { kind: 'help'; text: string }

interface ParsedArgs {
  dialect: CliDialect
  out?: string
  stdout: boolean
  force: boolean
  help: boolean
  name: string
  timestamp?: string
}

export function formatMigrationSql(dialect: CliDialect): string {
  return (
    [
      `-- TanStack AI persistence migration for ${dialect}`,
      ...ddl(dialect).map((statement) => `${statement};`),
    ].join('\n\n') + '\n'
  )
}

export async function runMigrationCli(
  argv: Array<string>,
  options: CliOptions = {},
): Promise<CliResult> {
  const parsed = parseArgs(argv)
  const help = helpText()
  if (parsed.help) return { kind: 'help', text: help }

  const cwd = options.cwd ?? process.cwd()
  const timestamp =
    parsed.timestamp ?? defaultTimestamp(options.now ?? new Date())
  const sql = formatMigrationSql(parsed.dialect)

  if (parsed.stdout) {
    options.writeStdout?.(sql)
    return { kind: 'stdout', sql }
  }

  const out = parsed.out
    ? resolveOut(cwd, parsed.out)
    : join(cwd, 'drizzle', `${timestamp}_${parsed.name}.sql`)

  await writeMigrationFile(out, sql, parsed.force)
  return { kind: 'file', path: out }
}

function parseArgs(argv: Array<string>): ParsedArgs {
  const parsed: ParsedArgs = {
    dialect: 'sqlite',
    stdout: false,
    force: false,
    help: false,
    name: 'tanstack_ai_persistence',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) {
      throw new Error(`Missing option at index ${i}.`)
    }

    switch (arg) {
      case '--dialect': {
        const dialect = readValue(argv, ++i, '--dialect')
        if (dialect !== 'sqlite' && dialect !== 'postgres') {
          throw new Error('Invalid --dialect. Expected sqlite or postgres.')
        }
        parsed.dialect = dialect
        break
      }
      case '--out':
        parsed.out = readValue(argv, ++i, '--out')
        break
      case '--stdout':
        parsed.stdout = true
        break
      case '--force':
        parsed.force = true
        break
      case '--name':
        parsed.name = readMigrationName(argv, ++i)
        break
      case '--timestamp': {
        const timestamp = readValue(argv, ++i, '--timestamp')
        if (!/^\d{14}$/.test(timestamp)) {
          throw new Error('Invalid --timestamp. Expected yyyymmddhhmmss.')
        }
        parsed.timestamp = timestamp
        break
      }
      case '--help':
      case '-h':
        parsed.help = true
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  return parsed
}

async function writeMigrationFile(
  out: string,
  sql: string,
  force: boolean,
): Promise<void> {
  try {
    await writeFile(out, sql, { flag: force ? 'w' : 'wx' })
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, sql, { flag: force ? 'w' : 'wx' })
      return
    }
    if (hasCode(error, 'EEXIST')) {
      throw new Error(
        `Output file already exists: ${out}. Pass --force to overwrite.`,
      )
    }
    throw error
  }
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code,
  )
}

function readValue(argv: Array<string>, index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`)
  }
  return value
}

function readMigrationName(argv: Array<string>, index: number): string {
  const name = readValue(argv, index, '--name')
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(
      'Invalid --name. Expected only letters, numbers, underscores, or hyphens.',
    )
  }
  return name
}

function resolveOut(cwd: string, out: string): string {
  return isAbsolute(out) ? out : join(cwd, out)
}

function defaultTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

function helpText(): string {
  return `tanstack-ai-persistence-drizzle

Generate a TanStack AI persistence SQL migration file.

Options:
  --dialect sqlite|postgres    SQL dialect to generate. Defaults to sqlite.
  --out <path>                 Write to a custom migration file path.
  --stdout                     Print SQL instead of writing a file.
  --timestamp <yyyymmddhhmmss> Use a deterministic timestamp.
  --name <name>                Safe migration name. Use letters, numbers, underscores, or hyphens.
  --force                      Overwrite an existing output file.
  --help, -h                   Show this help.
`
}
