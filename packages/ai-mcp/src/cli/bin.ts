import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from './config'
import { introspectServer } from './introspect'
import { emitDescriptors } from './emit'
import type { EmitInput } from './emit'

async function generate(cwd = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd)
  const input: EmitInput = {}
  for (const [name, server] of Object.entries(config.servers)) {
    process.stderr.write(`Introspecting MCP server "${name}"…\n`)
    const surface = await introspectServer(server)
    input[name] = { prefix: server.prefix, surface }
  }
  const out = await emitDescriptors(input)
  const outPath = resolve(cwd, config.outFile)
  writeFileSync(outPath, out, 'utf8')
  process.stderr.write(`Wrote ${outPath}\n`)
}

const cmd = process.argv[2]
if (cmd === 'generate') {
  generate().catch((err: unknown) => {
    const msg = err instanceof Error ? (err.stack ?? String(err)) : String(err)
    process.stderr.write(msg + '\n')
    process.exit(1)
  })
} else {
  process.stderr.write('Usage: tanstack-ai-mcp generate\n')
  process.exit(cmd ? 1 : 0)
}
