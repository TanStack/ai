/**
 * `coco init` — wire the Coco Vite plugin into a TanStack Start (or plain
 * Vite) project. Idempotent: re-running detects an already-installed plugin
 * and prints next steps instead of editing the config again.
 *
 * The edit is intentionally string-based and conservative. If the
 * `vite.config.ts` doesn't match the shape we recognize, we abort and print
 * the manual snippet the user should paste.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AGENTS, AGENT_BIN } from './agents.ts'
import { findOnPath } from './agent-status.ts'

export interface InitOptions {
  cwd: string
  /** When true, print what would change but don't write. */
  dryRun?: boolean
}

const CONFIG_CANDIDATES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
]

const COCO_IMPORT_LINE = `import { coco } from 'coco/vite'`

interface ProjectInfo {
  configPath: string
  isStart: boolean
}

const findViteConfig = async (cwd: string): Promise<ProjectInfo | null> => {
  for (const candidate of CONFIG_CANDIDATES) {
    const full = path.join(cwd, candidate)
    try {
      const stat = await fs.stat(full)
      if (stat.isFile()) {
        const source = await fs.readFile(full, 'utf8')
        return {
          configPath: full,
          isStart: /@tanstack\/react-start/.test(source),
        }
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

const MANUAL_SNIPPET = `Add the Coco plugin to your vite config manually:

  import { defineConfig } from 'vite'
  import { coco } from 'coco/vite'

  export default defineConfig({
    plugins: [
      coco(),
      // …existing plugins
    ],
  })
`

/**
 * Apply the Coco plugin to a vite config source. Returns the rewritten
 * source, or `null` if we couldn't find a `plugins: [...]` array to insert
 * into (caller should print the manual snippet).
 */
export const applyCocoToConfig = (source: string): string | null => {
  // Idempotency: already wired up?
  if (/from\s+['"]coco\/vite['"]/.test(source) || /\bcoco\(\)/.test(source)) {
    return source
  }

  // 1. Add the import. Prefer placing it right after the last existing
  //    `import` statement to keep the import block together. Falls back
  //    to the top of the file.
  const importBlockRe = /^(?:import[^\n]*\n)+/m
  const importMatch = source.match(importBlockRe)
  let withImport: string
  if (importMatch && typeof importMatch.index === 'number') {
    const end = importMatch.index + importMatch[0].length
    withImport =
      source.slice(0, end) + COCO_IMPORT_LINE + '\n' + source.slice(end)
  } else {
    withImport = COCO_IMPORT_LINE + '\n' + source
  }

  // 2. Insert `coco(),` at the top of the first `plugins: [...]` array.
  //    Handle both `plugins: [\n  …` and `plugins: [foo, bar]`.
  const pluginsRe = /plugins\s*:\s*\[/
  const pluginsMatch = withImport.match(pluginsRe)
  if (!pluginsMatch || typeof pluginsMatch.index !== 'number') {
    return null
  }
  const bracketEnd = pluginsMatch.index + pluginsMatch[0].length
  const after = withImport.slice(bracketEnd)

  // Newline-style: `plugins: [\n  foo,\n  bar,\n]`
  if (/^\s*\n/.test(after)) {
    const eol = after.indexOf('\n')
    const indentMatch = after.slice(eol + 1).match(/^[ \t]*/)
    const indent = indentMatch ? indentMatch[0] : '  '
    return (
      withImport.slice(0, bracketEnd) +
      '\n' +
      indent +
      'coco(),' +
      withImport.slice(bracketEnd)
    )
  }

  // Inline: `plugins: [foo, bar]`
  return (
    withImport.slice(0, bracketEnd) + 'coco(), ' + withImport.slice(bracketEnd)
  )
}

const installedCliNames = async (): Promise<Array<string>> => {
  const present = await Promise.all(
    AGENTS.map(async (a) => ((await findOnPath(AGENT_BIN[a.id])) ? a.bin : '')),
  )
  return present.filter(Boolean)
}

export const runInit = async (options: InitOptions): Promise<number> => {
  const { cwd, dryRun = false } = options
  const log = (msg: string) => process.stdout.write(`[coco init] ${msg}\n`)
  const err = (msg: string) => process.stderr.write(`[coco init] ${msg}\n`)

  log(`scanning ${cwd}…`)
  const project = await findViteConfig(cwd)
  if (!project) {
    err(
      'no vite.config.{ts,mts,js,mjs} found here. ' +
        'Run `coco init` from the root of a TanStack Start / Vite project.',
    )
    return 1
  }
  log(`found ${path.relative(cwd, project.configPath)}`)
  if (project.isStart) {
    log('detected TanStack Start (imports @tanstack/react-start).')
  } else {
    log(
      'no @tanstack/react-start import detected — plugging in anyway; Coco works with any Vite dev server.',
    )
  }

  const original = await fs.readFile(project.configPath, 'utf8')
  if (
    /from\s+['"]coco\/vite['"]/.test(original) ||
    /\bcoco\(\)/.test(original)
  ) {
    log('vite config already imports coco/vite — nothing to do.')
  } else {
    const updated = applyCocoToConfig(original)
    if (updated == null) {
      err(
        'could not locate a `plugins: [...]` array in your vite config. ' +
          'No changes written.',
      )
      process.stdout.write('\n' + MANUAL_SNIPPET + '\n')
      return 2
    }
    if (dryRun) {
      log('--dry-run: would rewrite vite config to add coco():')
      process.stdout.write('\n' + updated + '\n')
    } else {
      await fs.writeFile(project.configPath, updated, 'utf8')
      log(`added \`coco()\` plugin to ${path.basename(project.configPath)}.`)
    }
  }

  const installed = await installedCliNames()
  if (installed.length === 0) {
    process.stdout.write(
      '\nNo supported coding-agent CLI was found on PATH. The Coco panel ' +
        'will stay hidden until at least one of the following is installed:\n' +
        '  - claude   (npm i -g @anthropic-ai/claude-code)\n' +
        '  - codex    (ships with @openai/codex-sdk; install via your codex setup)\n' +
        '  - gemini   (npm i -g @google/gemini-cli)\n' +
        '  - opencode (npm i -g opencode-ai)\n',
    )
  } else {
    process.stdout.write(
      `\nDetected agent CLI${installed.length === 1 ? '' : 's'} on PATH: ${installed.join(', ')}.\n`,
    )
  }

  process.stdout.write(
    '\nNext steps:\n' +
      '  1. Make sure `coco` is installed as a devDependency:\n' +
      '       pnpm add -D coco   (or npm i -D coco / yarn add -D coco)\n' +
      '  2. Start your dev server as usual (e.g. `pnpm dev`).\n' +
      '  3. Open the dev URL — Coco appears as a 🥥 launcher when an agent CLI is on PATH.\n',
  )
  return 0
}
