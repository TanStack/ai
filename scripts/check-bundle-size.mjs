#!/usr/bin/env node
/**
 * Minified gzip size of each published package export.
 *
 * Bundles that entry's own built files. Dependencies stay external, so this
 * is not the cost of openai, the AWS SDK, or another workspace package.
 *
 *   pnpm build:all && node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --html
 *   node scripts/check-bundle-size.mjs --self-test
 *
 * The markdown report leaves dependencies external.
 * `--html` bundles dependencies and writes scripts/bundle-size.html.
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

// ponytail: native addons and workerd builtins cannot be inlined.
// They stay external, so their bytes are not in the bar.
const externalRuntime = {
  name: 'external-runtime',
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, (args) => ({
      path: args.path,
      external: true,
    }))
    build.onLoad({ filter: /\.node$/ }, () => ({
      contents: 'export default {}',
      loader: 'js',
    }))
    build.onResolve({ filter: /^cloudflare:/ }, (args) => ({
      path: args.path,
      external: true,
    }))
  },
}

function esbuild() {
  return require('esbuild')
}

async function bundle(absPath, extra) {
  const result = await esbuild().build({
    entryPoints: [absPath],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [svelteSource, externalRuntime],
    ...extra,
  })
  const bytes = Buffer.concat(result.outputFiles.map((file) => file.contents))
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes).length,
    metafile: result.metafile,
  }
}

async function measure(absPath) {
  const size = await bundle(absPath, { packages: 'external' })
  return { raw: size.raw, gzip: size.gzip }
}

/**
 * @param {string} file
 * @param {Map<string, string>} dirToName
 */
function partName(file, dirToName) {
  const chunks = file.split('node_modules/')
  if (chunks.length > 1) {
    const parts = chunks[chunks.length - 1].split('/')
    if (!parts[0]) return null
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  }
  const match = file.match(/(?:^|\/)packages\/([^/]+)\//)
  if (match) return dirToName.get(match[1]) || match[1]
  return null
}

/**
 * @param {Record<string, { bytesInOutput?: number }>} inputs
 * @param {Map<string, string>} dirToName
 */
function groupParts(inputs, dirToName) {
  /** @type {Map<string, number>} */
  const sums = new Map()
  for (const [file, info] of Object.entries(inputs)) {
    const bytes = info.bytesInOutput || 0
    if (bytes < 1) continue
    const name = partName(file, dirToName) || 'this package'
    sums.set(name, (sums.get(name) || 0) + bytes)
  }
  return [...sums.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
}

/**
 * Names that are in the main entry and almost absent from this subpath.
 * @param {{ name: string, bytes: number }[]} mainParts
 * @param {{ name: string, bytes: number }[]} subParts
 * @param {string} ownName
 */
function disappeared(mainParts, subParts, ownName) {
  const sub = new Map(subParts.map((part) => [part.name, part.bytes]))
  return mainParts
    .filter((part) => part.name !== ownName)
    .filter((part) => part.bytes >= 1024)
    .filter((part) => {
      const bytes = sub.get(part.name) ?? 0
      return bytes < 1024 && bytes * 4 < part.bytes
    })
    .map((part) => part.name)
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
    `For dependency composition, open \`scripts/bundle-size.html\` (\`node scripts/check-bundle-size.mjs --html\`).`,
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

function htmlPage(data) {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bundle size</title>
<style>
  body { font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 52rem; color: #1c1917; background: #fafaf9; padding: 0 1rem; }
  h1 { font-size: 1.35rem; margin-bottom: .4rem; }
  p { margin: .4rem 0; }
  input { width: 100%; box-sizing: border-box; padding: .5rem .7rem; margin: 1rem 0; border: 1px solid #d6d3d1; border-radius: 6px; }
  details { background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; margin: .45rem 0; }
  summary { cursor: pointer; padding: .65rem .8rem; }
  .meta { color: #57534e; }
  .entries { display: flex; flex-wrap: wrap; gap: .35rem; padding: 0 .8rem; }
  button { font: inherit; border: 1px solid #d6d3d1; background: #fff; border-radius: 999px; padding: .25rem .6rem; cursor: pointer; }
  button[aria-pressed="true"] { background: #1c1917; color: #fff; border-color: #1c1917; }
  .panel { padding: .8rem; }
  .bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: #e7e5e4; }
  .bar i { display: block; height: 100%; }
  .legend { list-style: none; padding: 0; margin: .5rem 0; }
  .legend li { display: flex; gap: .5rem; align-items: baseline; margin: .15rem 0; }
  .swatch { width: .7rem; height: .7rem; border-radius: 2px; display: inline-block; }
  .gone { margin: .4rem 0 0; }
  .fail { color: #9f1239; }
</style>
</head>
<body>
<h1>Bundle size</h1>
<p>Measured ${data.measured}. ${data.entryCount} subpath exports. Each size is the minified gzip of that export with dependencies included. Node built-ins, native .node files, and cloudflare:workers stay external. Their bytes are not in the bars.</p>
<p>Tree-shaking removes code that the export does not import. That code disappears from this bundle. The file is still in the published package.</p>
<p>A subpath export is a separate entry. Import one subpath. Pieces that only another subpath reaches are absent here. A dependency can also shrink. The bar is the bytes that remain after unused exports are removed.</p>
<p id="example"></p>
<input id="q" type="search" placeholder="Filter packages" aria-label="Filter packages">
<div id="list"></div>
<script type="application/json" id="data">${json}</script>
<script>
const COLORS = ['#1c1917', '#b45309', '#0369a1', '#047857', '#7c3aed']
const data = JSON.parse(document.getElementById('data').textContent)

function kb(bytes) { return (bytes / 1024).toFixed(1) + ' KiB' }

function disappeared(main, sub, own) {
  const have = new Map(sub.parts.map((part) => [part.name, part.bytes]))
  return main.parts.filter((part) => {
    if (part.name === own || part.bytes < 1024) return false
    const bytes = have.get(part.name) || 0
    return bytes < 1024 && bytes * 4 < part.bytes
  })
}

const example = document.getElementById('example')
const ai = data.packages.find((pkg) => pkg.name === '@tanstack/ai')
if (ai) {
  const main = ai.entries.find((entry) => entry.entry === '.')
  const client = ai.entries.find((entry) => entry.entry === './client')
  if (main && client) {
    const gone = disappeared(main, client, ai.name).slice(0, 5).map((part) => part.name)
    example.textContent = '@tanstack/ai . is ' + kb(main.gzip) + ' gzip. ./client is ' + kb(client.gzip) + ' gzip. Gone from ./client: ' + (gone.join(', ') || 'nothing over 1 KiB') + '.'
  }
}

const list = document.getElementById('list')
const q = document.getElementById('q')

function draw(pkg, entry, panel) {
  const top = entry.parts.slice(0, 5)
  const total = entry.parts.reduce((sum, part) => sum + part.bytes, 0) || 1
  const bar = document.createElement('div')
  bar.className = 'bar'
  const legend = document.createElement('ul')
  legend.className = 'legend'
  top.forEach((part, index) => {
    const color = COLORS[index % COLORS.length]
    const slice = document.createElement('i')
    slice.style.width = Math.max(1, (part.bytes / total) * 100) + '%'
    slice.style.background = color
    slice.title = part.name
    bar.append(slice)
    const item = document.createElement('li')
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.background = color
    item.append(swatch, document.createTextNode(part.name + ' — ' + kb(part.bytes) + ' minified'))
    legend.append(item)
  })
  panel.replaceChildren(bar, legend)
  const main = pkg.entries.find((item) => item.entry === '.')
  if (main && entry.entry !== '.') {
    const gone = disappeared(main, entry, pkg.name).map((part) => part.name)
    const line = document.createElement('p')
    line.className = 'gone'
    line.textContent = gone.length
      ? 'Gone from this subpath (present on .): ' + gone.slice(0, 8).join(', ') + '.'
      : 'Nothing over 1 KiB from . disappears on this subpath.'
    panel.append(line)
  }
  if (entry.parts.length > 5) {
    const more = document.createElement('p')
    more.className = 'meta'
    more.textContent = 'Showing the 5 biggest pieces of ' + entry.parts.length + '.'
    panel.append(more)
  }
}

function render() {
  const query = q.value.trim().toLowerCase()
  list.replaceChildren()
  let shown = 0
  for (const pkg of data.packages) {
    const hay = (pkg.name + ' ' + pkg.entries.map((entry) => entry.entry).join(' ')).toLowerCase()
    if (query && !hay.includes(query)) continue
    shown += 1
    const details = document.createElement('details')
    if (shown === 1) details.open = true
    const summary = document.createElement('summary')
    const biggest = pkg.entries.reduce((best, entry) => entry.gzip > best.gzip ? entry : best, pkg.entries[0])
    summary.textContent = pkg.name + ' — ' + kb(biggest.gzip) + ' gzip — ' + pkg.entries.length + ' subpaths'
    details.append(summary)
    const row = document.createElement('div')
    row.className = 'entries'
    const panel = document.createElement('div')
    panel.className = 'panel'
    pkg.entries.forEach((entry, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = entry.entry + ' ' + kb(entry.gzip)
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false')
      button.addEventListener('click', () => {
        for (const other of row.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false')
        button.setAttribute('aria-pressed', 'true')
        draw(pkg, entry, panel)
      })
      row.append(button)
    })
    if (pkg.entries[0]) draw(pkg, pkg.entries[0], panel)
    details.append(row, panel)
    list.append(details)
  }
  if (data.failures && data.failures.length) {
    const fail = document.createElement('p')
    fail.className = 'fail'
    fail.textContent = data.failures.length + ' exports failed to bundle. First: ' + data.failures[0].name + ' ' + data.failures[0].entry
    list.append(fail)
  }
  if (!shown) {
    const empty = document.createElement('p')
    empty.textContent = 'No package matches.'
    list.append(empty)
  }
}

q.addEventListener('input', render)
render()
</script>
</body>
</html>
`
}

async function writeHtml() {
  const packages = publishedPackages()
  /** @type {Map<string, string>} */
  const dirToName = new Map(
    packages.map((item) => [
      item.dir.split('/').at(-1) || item.name,
      item.name,
    ]),
  )
  /** @type {{ name: string, entries: { entry: string, raw: number, gzip: number, parts: { name: string, bytes: number }[] }[] }[]} */
  const rows = []
  /** @type {{ name: string, entry: string, error: string }[]} */
  const failures = []
  let entryCount = 0
  for (const item of packages) {
    /** @type {{ entry: string, raw: number, gzip: number, parts: { name: string, bytes: number }[] }[]} */
    const entries = []
    for (const entry of entriesFromPackage(item.pkg)) {
      entryCount += 1
      try {
        const abs = resolve(item.dir, entry.target)
        let size
        try {
          size = await bundle(abs, { metafile: true, platform: 'node' })
        } catch {
          // Browser UI bundles (Solid) resolve to the server build on the node platform.
          size = await bundle(abs, { metafile: true, platform: 'browser' })
        }
        /** @type {Record<string, { bytesInOutput?: number }>} */
        /** @type {Record<string, { bytesInOutput?: number }>} */
        const inputs = {}
        for (const output of Object.values(size.metafile.outputs)) {
          for (const [file, info] of Object.entries(output.inputs)) {
            const prev = inputs[file]?.bytesInOutput || 0
            inputs[file] = { bytesInOutput: prev + (info.bytesInOutput || 0) }
          }
        }
        entries.push({
          entry: entry.key,
          raw: size.raw,
          gzip: size.gzip,
          parts: groupParts(inputs, dirToName).filter(
            (part) => part.bytes >= 256,
          ),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({
          name: item.name,
          entry: entry.key,
          error: message.split('\n')[0],
        })
      }
    }
    if (!entries.length) continue
    entries.sort((a, b) => {
      if (a.entry === '.') return -1
      if (b.entry === '.') return 1
      return b.gzip - a.gzip
    })
    rows.push({ name: item.name, entries })
  }
  rows.sort((a, b) => {
    const ag = Math.max(...a.entries.map((entry) => entry.gzip))
    const bg = Math.max(...b.entries.map((entry) => entry.gzip))
    return bg - ag || a.name.localeCompare(b.name)
  })
  const html = htmlPage({
    measured: measuredOn(),
    entryCount: entryCount - failures.length,
    packages: rows,
    failures,
  })
  const out = join(ROOT, 'scripts', 'bundle-size.html')
  writeFileSync(out, html)
  process.stdout.write(
    `${out}\n${rows.length} packages, ${entryCount - failures.length} entries, ${failures.length} failed\n`,
  )
  if (failures.length) {
    for (const failure of failures) {
      process.stderr.write(
        `${failure.name} ${failure.entry}: ${failure.error}\n`,
      )
    }
    process.exitCode = 1
  }
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
  const names = new Map([
    ['ai', '@tanstack/ai'],
    ['ai-utils', '@tanstack/ai-utils'],
  ])
  const own = partName('/repo/packages/ai/dist/esm/index.js', names)
  const dep = partName(
    '/repo/node_modules/.pnpm/fast-json-patch@3/node_modules/fast-json-patch/index.js',
    names,
  )
  const scoped = partName(
    '/repo/packages/ai/node_modules/@ag-ui/core/dist/index.js',
    names,
  )
  const sibling = partName('/repo/packages/ai-utils/dist/esm/id.js', names)
  if (own !== '@tanstack/ai' || dep !== 'fast-json-patch') {
    throw new Error(`partName ${own} ${dep}`)
  }
  if (scoped !== '@ag-ui/core' || sibling !== '@tanstack/ai-utils') {
    throw new Error(`partName scoped ${scoped} ${sibling}`)
  }
  const gone = disappeared(
    [
      { name: '@tanstack/ai', bytes: 90000 },
      { name: '@cfworker/json-schema', bytes: 8000 },
      { name: 'partial-json', bytes: 500 },
    ],
    [
      { name: '@tanstack/ai', bytes: 20000 },
      { name: 'partial-json', bytes: 500 },
    ],
    '@tanstack/ai',
  )
  if (gone.join() !== '@cfworker/json-schema') throw new Error(`gone ${gone}`)

  process.stdout.write('self-test ok\n')
}

if (process.argv.includes('--self-test')) await selfTest()
else if (process.argv.includes('--html')) await writeHtml()
else await main()
