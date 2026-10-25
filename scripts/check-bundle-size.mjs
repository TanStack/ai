#!/usr/bin/env node
/**
 * Minified gzip size of each published package export.
 *
 * Bundles that entry's own built files. Dependencies stay external, so this
 * is not the cost of openai, the AWS SDK, or another workspace package.
 *
 *   pnpm build:all && node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --self-test
 */
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CODE_EXT = /\.(?:mjs|cjs|js)$/
const PREFER = ['import', 'default', 'require', 'browser', 'node', 'module']

// ponytail: esbuild already ships with the react-native smoke package.
// Add a root devDependency if that package drops it.
const require = createRequire(
  new URL('../testing/react-native-smoke/package.json', import.meta.url),
)

/** @param {unknown} value */
function codeTarget(value) {
  if (typeof value === 'string') return CODE_EXT.test(value) ? value : null
  if (!value || typeof value !== 'object') return null
  for (const key of PREFER) {
    if (!(key in value)) continue
    const found = codeTarget(
      /** @type {Record<string, unknown>} */ (value)[key],
    )
    if (found) return found
  }
  return null
}

/** @param {{ exports?: Record<string, unknown> }} pkg */
function entriesFromPackage(pkg) {
  /** @type {{ key: string, target: string }[]} */
  const out = []
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (key === './package.json') continue
    const target = codeTarget(value)
    if (target) out.push({ key, target })
  }
  return out
}

function publishedPackages() {
  /** @type {{ dir: string, name: string, pkg: { exports?: Record<string, unknown> } }[]} */
  const out = []
  for (const dirName of readdirSync(join(ROOT, 'packages'))) {
    const dir = join(ROOT, 'packages', dirName)
    let pkg
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (pkg.private || typeof pkg.name !== 'string') continue
    out.push({ dir, name: pkg.name, pkg })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const svelteSource = {
  name: 'svelte-source',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, (args) => {
      const text = readFileSync(args.path, 'utf8')
      return {
        contents: `export default ${JSON.stringify(text)}`,
        loader: 'js',
      }
    })
  },
}

async function measure(absPath) {
  const esbuild = require('esbuild')
  const result = await esbuild.build({
    entryPoints: [absPath],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
    plugins: [svelteSource],
  })
  const bytes = Buffer.concat(result.outputFiles.map((file) => file.contents))
  return { raw: bytes.length, gzip: gzipSync(bytes).length }
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1)
}

function measuredOn() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function report(rows, failures) {
  const lines = [
    `# Published entry bundle size`,
    ``,
    `Measured ${measuredOn()}. Each row is one \`exports\` entry, minified and gzipped. Dependencies are external. \`.svelte\` files are counted as their published source. Shared modules are counted again in each entry that pulls them in, so do not add the rows up into a package total.`,
    ``,
    `${rows.length} entries measured. ${failures.length} failed.`,
    ``,
    `## Largest 15`,
    ``,
    `| Package | Entry | Minified | Gzip |`,
    `| --- | --- | ---: | ---: |`,
  ]
  for (const row of rows.slice(0, 15)) {
    lines.push(
      `| \`${row.name}\` | \`${row.entry}\` | ${kb(row.raw)} KiB | ${kb(row.gzip)} KiB |`,
    )
  }
  lines.push(
    ``,
    `## Every entry`,
    ``,
    `| Package | Entry | Minified | Gzip |`,
    `| --- | --- | ---: | ---: |`,
  )
  for (const row of rows) {
    lines.push(
      `| \`${row.name}\` | \`${row.entry}\` | ${kb(row.raw)} KiB | ${kb(row.gzip)} KiB |`,
    )
  }
  if (failures.length) {
    lines.push(``, `## Failed`, ``)
    for (const failure of failures) {
      lines.push(
        `- \`${failure.name}\` \`${failure.entry}\` (${failure.target}): ${failure.error}`,
      )
    }
  }
  lines.push(``)
  return lines.join('\n')
}

async function main() {
  /** @type {{ name: string, entry: string, raw: number, gzip: number }[]} */
  const rows = []
  /** @type {{ name: string, entry: string, target: string, error: string }[]} */
  const failures = []
  for (const item of publishedPackages()) {
    for (const entry of entriesFromPackage(item.pkg)) {
      const abs = resolve(item.dir, entry.target)
      try {
        const size = await measure(abs)
        rows.push({ name: item.name, entry: entry.key, ...size })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({
          name: item.name,
          entry: entry.key,
          target: entry.target,
          error: message.split('\n')[0],
        })
      }
    }
  }
  rows.sort((a, b) => b.gzip - a.gzip || a.name.localeCompare(b.name))
  process.stdout.write(report(rows, failures))
  if (failures.length) process.exitCode = 1
}

async function selfTest() {
  const entries = entriesFromPackage({
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './package.json': { default: './package.json' },
      './ui': { default: './dist/ui.mjs' },
      './data': './data.json',
    },
  })
  const got = entries.map((entry) => `${entry.key} ${entry.target}`).join(', ')
  const want = '. ./dist/index.js, ./ui ./dist/ui.mjs'
  if (got !== want) throw new Error(`entries:\n${got}\nwant:\n${want}`)

  const dir = mkdtempSync(join(tmpdir(), 'bundle-size-'))
  try {
    writeFileSync(
      join(dir, 'dep.js'),
      'export function add(a, b) { return a + b }\n',
    )
    writeFileSync(join(dir, 'A.svelte'), '<p>hello</p>\n')
    writeFileSync(
      join(dir, 'index.js'),
      "import { add } from './dep.js'\nimport View from './A.svelte'\nexport const n = add(1, 2)\nexport { View }\n",
    )
    const size = await measure(join(dir, 'index.js'))
    if (size.raw <= 0 || size.gzip <= 0) {
      throw new Error(`size ${size.raw} ${size.gzip}`)
    }
    if (size.raw > 400) throw new Error(`bundle did not minify: ${size.raw}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.stdout.write('self-test ok\n')
}

if (process.argv.includes('--self-test')) await selfTest()
else await main()
