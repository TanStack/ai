// Temporary benchmark: new task hashes retain agent-to-agent artifact transfer.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

if (!process.env.NX_CI_CACHE_BUST) throw new Error('Missing cache-bust nonce')
const graphFile = join(tmpdir(), `ai-cache-bust-${process.pid}.json`)
execFileSync('pnpm', ['exec', 'nx', 'graph', `--file=${graphFile}`], {
  stdio: 'inherit',
})
const { graph } = JSON.parse(readFileSync(graphFile, 'utf8'))
rmSync(graphFile)
for (const { data } of Object.values(graph.nodes)) {
  const file = join(data.root, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  pkg.nx ??= {}
  pkg.nx.targets ??= {}
  for (const [name, target] of Object.entries(data.targets ?? {})) {
    pkg.nx.targets[name] = {
      ...pkg.nx.targets[name],
      inputs: [
        ...(target.inputs ?? ['default', '^default']),
        { env: 'NX_CI_CACHE_BUST' },
      ],
    }
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}
console.log(`Cache-bust applied to ${Object.keys(graph.nodes).length} projects`)
