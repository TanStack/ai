import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prismaModels, prismaModelsFilename } from './models'

export interface ModelsCliOutput {
  writeStdout: (value: string) => void
}

export class ModelsCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelsCliError'
  }
}

const usage = `Usage: tanstack-ai-prisma-models (--out <directory> | --stdout) [--force]

Options:
  --out <directory>  Copy the models-only Prisma schema fragment.
  --stdout           Print the models-only Prisma schema fragment.
  --force            Replace a divergent fragment when copying.
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
        throw new ModelsCliError('--out requires a directory.')
      }
      if (outDirectory !== undefined) {
        throw new ModelsCliError('--out may only be provided once.')
      }
      outDirectory = value
      index++
    } else {
      throw new ModelsCliError(`Unknown argument: ${argument ?? ''}`)
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

/** Execute the models asset CLI. Exported for deterministic CLI tests. */
export async function runPrismaModelsCli(
  args: ReadonlyArray<string>,
  output: ModelsCliOutput = {
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
    throw new ModelsCliError(
      'Provide exactly one output mode: --out <directory> or --stdout.',
    )
  }
  if (parsed.stdout) {
    if (parsed.force) {
      throw new ModelsCliError('--force can only be used with --out.')
    }
    output.writeStdout(`${prismaModels.trimEnd()}\n`)
    return
  }

  const outDirectory = parsed.outDirectory
  if (!outDirectory) {
    throw new ModelsCliError('--out requires a directory.')
  }
  await mkdir(outDirectory, { recursive: true })
  const destination = join(outDirectory, prismaModelsFilename)
  const existing = await readExistingFile(destination)
  if (existing === prismaModels) return
  if (existing !== undefined && !parsed.force) {
    throw new ModelsCliError(
      `Refusing to overwrite divergent Prisma models file: ${destination}. Re-run with --force to replace it.`,
    )
  }
  await writeFile(destination, prismaModels, 'utf8')
}
