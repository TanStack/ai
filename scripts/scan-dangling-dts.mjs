// scan-dangling-dts.mjs — run from repo root after `pnpm build:all`
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'

const ROOT = process.cwd()

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (e !== 'node_modules') walk(p, out)
    } else if (e.endsWith('.d.ts')) {
      out.push(p)
    }
  }
  return out
}

const RE = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g
const findings = []
const dists = readdirSync(join(ROOT, 'packages'))
  .map((p) => join(ROOT, 'packages', p, 'dist'))
  .filter((d) => existsSync(d))

for (const dist of dists) {
  for (const file of walk(dist)) {
    const src = readFileSync(file, 'utf8')
    let m
    while ((m = RE.exec(src))) {
      const spec = m[1]
      const abs = resolve(dirname(file), spec)
      let ok
      if (/\.(js|mjs|cjs)$/.test(spec)) {
        const noext = abs.replace(/\.(js|mjs|cjs)$/, '')
        ok = ['.d.ts', '.d.mts', '.d.cts', '.ts', '.tsx'].some((x) =>
          existsSync(noext + x),
        ) // no /index fallback
      } else {
        ok =
          ['.d.ts', '.ts', '.tsx'].some((x) => existsSync(abs + x)) ||
          ['/index.d.ts', '/index.ts'].some((x) => existsSync(abs + x))
      }
      if (!ok) findings.push(`${spec}  <-  ${file.replace(ROOT + '/', '')}`)
    }
  }
}

console.log(findings.sort().join('\n') || 'clean')
console.log(`\n${findings.length} dangling specifiers`)

if (findings.length > 0) {
  process.exit(1)
}
